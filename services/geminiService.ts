import { GoogleGenAI, Type, Schema, GenerateContentResponse } from "@google/genai";
import { Character, Scene, Chapter, Shot, ChapterMetadata, PromptConfig, VISUAL_AGE_OPTIONS, CHARACTER_ROLES, AnalysisDebugLog, AVAILABLE_MODELS } from "../types";

// --- Dynamic API Client ---
const getAIClient = () => {
  const customKey = typeof window !== 'undefined' ? localStorage.getItem('custom_gemini_api_key') : null;
  const apiKey = customKey || process.env.API_KEY;
  
  if (!apiKey) {
    throw new Error("未检测到 API Key。请在设置中配置您的 Gemini API Key。");
  }
  
  return new GoogleGenAI({ apiKey });
};

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function callAIWithRetry<T>(fn: () => Promise<T>, retries = 8, baseDelay = 6000): Promise<T> {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (e: any) {
      if (i === 0) console.warn("AI Call Failed (Attempt 1), inspecting error:", e);
      
      const errorCode = e.status || e.code || e.error?.code || e.error?.status;
      const errorMessage = e.message || e.error?.message || JSON.stringify(e);
      
      const isRateLimit = 
          errorCode === 429 || 
          errorCode === 'RESOURCE_EXHAUSTED' || 
          (typeof errorMessage === 'string' && (
              errorMessage.includes('429') || 
              errorMessage.includes('quota') || 
              errorMessage.includes('RESOURCE_EXHAUSTED')
          ));
      
      if (isRateLimit && i < retries - 1) {
        // More aggressive backoff: 2^i * baseDelay
        const jitter = Math.random() * 3000;
        const waitTime = baseDelay * Math.pow(2, i) + jitter;
        console.warn(`⚠️ API 频率限制 (429). 正在进行指数退避重试 (${i + 1}/${retries})... 需等待 ${Math.round(waitTime/1000)}秒`);
        await delay(waitTime);
        continue;
      }
      
      if (isRateLimit && i === retries - 1) {
          throw new Error("API 调用过于频繁，已达到重试上限。请在设置中增加【API 请求间隔】，或更换低频限制更少的模型。");
      }
      
      throw e;
    }
  }
  throw new Error("Max retries reached");
}

export const DEFAULT_PROMPTS: PromptConfig = {
  modelName: 'gemini-3-flash-preview',
  apiDelay: 5000, // Default to 5s for free tier safety
  entityExtraction: `
任务：小说设定深度提取 (角色分级模式)
语言：中文 (Chinese)

请分析文本，提取**角色**和**场景**。

【⭐ 关键：年龄精准提取】
1. **数字优先**：如果文中出现明确数字（如“二十五岁”），请直接填入数字年龄。
2. **视觉推理**：若无数字，必须结合外貌描写推理 \`age\` (Visual Age)。
   - 根据“皱纹、白发”判断为“老年”，根据“稚嫩、校服”判断为“少年/青年”。
   - 严禁全部填“外表无法判断”。

【⭐ 角色一致性与身份锁定】
- **Group Name**：**核心身份标识**。必须使用该角色的底层原名（如“唐曾”），即使他被赐名（如“三藏”）或变身，Group Name 保持一致，以便对齐。
- **Name**：使用当前片段中的称呼或形态名称。
- **Role**：戏份严格分级 (主要/次要/配角/路人甲)。

【⭐ 武器与服装】
- **Weapons**：仅提取实体武器外观。
- **Clothing**：提取当前穿着。

返回符合 Schema 的 JSON。
`,
  entityEnrichment: `
任务：小说角色与场景数据智能补全
语言：中文 (Chinese)

你将收到一份角色和场景的 JSON 数据。请针对以下情况进行补全：
1. **描述缺失**: 根据名称/职业进行合理补全。
2. **年龄逻辑**: 检查并修正不合理的年龄段。
返回完整的 JSON 数据。
`,
  sceneOptimization: `
任务：场景库智能清洗与分级
语言：中文 (Chinese)

合并同类场景，丰富视觉细节。返回 JSON 格式。
`,
  chapterSplit: "", 
  storyboard: `
任务：将本章节转化为影视分镜脚本。
语言：中文 (Chinese)

【重要】文本中的角色已使用 {角色组}_{形态名} 格式标注。请参考库中视觉描述。
输出 40+ 个镜头，包含景别、视角、视觉/视频提示词、台词、音效。
返回 JSON 格式。
`
};

const characterSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    id: { type: Type.STRING },
    groupName: { type: Type.STRING },
    name: { type: Type.STRING },
    aliases: { type: Type.ARRAY, items: { type: Type.STRING } },
    role: { type: Type.STRING, enum: CHARACTER_ROLES },
    age: { type: Type.STRING },
    description: { type: Type.STRING },
    visualMemoryPoints: { type: Type.STRING },
    clothingStyles: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { phase: { type: Type.STRING }, description: { type: Type.STRING } } } },
    weapons: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { name: { type: Type.STRING }, description: { type: Type.STRING } } } }
  }
};

const sceneSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    id: { type: Type.STRING },
    groupName: { type: Type.STRING },
    name: { type: Type.STRING },
    aliases: { type: Type.ARRAY, items: { type: Type.STRING } },
    description: { type: Type.STRING },
    structure: { type: Type.STRING, enum: ["内景", "外景"] },
    atmosphere: { type: Type.STRING },
    style: { type: Type.STRING },
    type: { type: Type.STRING, enum: ["核心据点", "剧情节点", "过场"] },
    frequency: { type: Type.NUMBER }
  }
};

const extractionSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    characters: { type: Type.ARRAY, items: characterSchema },
    scenes: { type: Type.ARRAY, items: sceneSchema },
  },
};

const storyboardSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    shots: { type: Type.ARRAY, items: {
      type: Type.OBJECT,
      properties: {
        id: { type: Type.STRING },
        speaker: { type: Type.STRING },
        script: { type: Type.STRING },
        visualPrompt: { type: Type.STRING },
        videoPrompt: { type: Type.STRING },
        shotType: { type: Type.STRING },
        angle: { type: Type.STRING },
        audio: { type: Type.STRING },
        sfx: { type: Type.STRING }
      },
      required: ["id", "speaker", "script", "visualPrompt", "videoPrompt", "shotType", "angle"]
    }}
  }
};

function generateId() { return Math.random().toString(36).substr(2, 9); }
function normalizeKey(str: string) { return str.replace(/[\s\-_]/g, '').toLowerCase(); }

export const analyzeEntitiesWithProgress = async (
    fullText: string, 
    config: PromptConfig,
    onProgress: (percent: number, status: string) => void,
    signal?: AbortSignal
): Promise<{ characters: Character[], scenes: Scene[], debugLog: AnalysisDebugLog[] }> => {
  
  const modelId = config.modelName || DEFAULT_PROMPTS.modelName;
  const modelMeta = AVAILABLE_MODELS.find(m => m.id === modelId) || AVAILABLE_MODELS[0];
  const CHUNK_SIZE = modelMeta.maxChunkChars;
  
  const chunks: string[] = [];
  for (let i = 0; i < fullText.length; i += CHUNK_SIZE) chunks.push(fullText.slice(i, i + CHUNK_SIZE));

  const charMap = new Map<string, Character>(); 
  const sceneMap = new Map<string, Scene>(); 
  const debugLogs: AnalysisDebugLog[] = [];
  const basePrompt = (config.entityExtraction && config.entityExtraction.trim().length > 0) ? config.entityExtraction : DEFAULT_PROMPTS.entityExtraction;
  const pacingDelay = config.apiDelay || DEFAULT_PROMPTS.apiDelay || 5000;
  const ai = getAIClient();

  for (let i = 0; i < chunks.length; i++) {
    if (signal?.aborted) throw new Error("Analysis cancelled");
    const chunk = chunks[i];
    const progress = Math.round(((i) / chunks.length) * 100);
    const startTime = Date.now(); 
    onProgress(progress, `正在分析第 ${i + 1}/${chunks.length} 部分... (模型: ${modelMeta.name})`);

    let contextStr = "";
    if (charMap.size > 0 || sceneMap.size > 0) {
        const charContextList = Array.from(charMap.values()).slice(0, 10).map(c => `• ${c.groupName}(${c.name})`).join('\n');
        const sceneContextList = Array.from(sceneMap.values()).slice(0, 10).map(s => `• ${s.groupName}(${s.name})`).join('\n');
        contextStr = `\n\n【已知实体摘要(防重复)】\n角色:\n${charContextList}\n场景:\n${sceneContextList}`;
    }

    try {
        const response = await callAIWithRetry<GenerateContentResponse>(() => ai.models.generateContent({
            model: modelId,
            contents: { parts: [{ text: basePrompt }, { text: contextStr }, { text: `文本片段:\n${chunk}` }] },
            config: { responseMimeType: "application/json", responseSchema: extractionSchema },
        }));
        const rawText = response.text || "";
        let parsedData = JSON.parse(rawText);
        debugLogs.push({ timestamp: new Date().toISOString(), chunkIndex: i, rawResponse: rawText, parsedData, usedPrompt: i === 0 ? basePrompt : undefined });

        if (Array.isArray(parsedData.characters)) {
            parsedData.characters.forEach(c => {
                const group = c.groupName || "未命名";
                const name = c.name || "未命名";
                const key = normalizeKey(group) + "_" + normalizeKey(name);
                const existing = charMap.get(key);
                if (existing) {
                    charMap.set(key, { ...existing, aliases: Array.from(new Set([...existing.aliases, ...(c.aliases || [])])), weapons: [...(existing.weapons || []), ...(c.weapons || [])] });
                } else {
                    charMap.set(key, { ...c, id: generateId(), groupName: group, name });
                }
            });
        }
        if (Array.isArray(parsedData.scenes)) {
             parsedData.scenes.forEach(s => {
                    const group = s.groupName || "未命名";
                    const name = s.name || "未命名";
                    const key = normalizeKey(group) + "_" + normalizeKey(name);
                    const existing = sceneMap.get(key);
                    if (!existing) sceneMap.set(key, { ...s, id: generateId(), groupName: group, name });
            });
        }
        
        // Pacing delay to avoid RPM limits
        const elapsed = Date.now() - startTime;
        const remainingWait = Math.max(0, pacingDelay - elapsed);
        if (remainingWait > 0) {
            onProgress(progress, `冷却中... (${Math.round(remainingWait/1000)}s)`);
            await delay(remainingWait);
        }
    } catch (e: any) {
        if (signal?.aborted) throw new Error("Analysis cancelled");
        console.error(`Chunk ${i} failed`, e);
        debugLogs.push({ timestamp: new Date().toISOString(), chunkIndex: i, rawResponse: "", parsedData: null, error: e.message });
    }
  }
  return { characters: Array.from(charMap.values()), scenes: Array.from(sceneMap.values()), debugLog: debugLogs };
};

export const enrichEntities = async (
    data: { characters: Character[], scenes: Scene[] },
    config: PromptConfig
): Promise<{ characters: Character[], scenes: Scene[] }> => {
    const basePrompt = config.entityEnrichment || DEFAULT_PROMPTS.entityEnrichment;
    const modelId = config.modelName || DEFAULT_PROMPTS.modelName;
    const ai = getAIClient();
    try {
        const response = await callAIWithRetry<GenerateContentResponse>(() => ai.models.generateContent({
            model: modelId,
            contents: { parts: [{ text: basePrompt }, { text: `【待补全数据】\n${JSON.stringify(data)}` }] },
            config: { responseMimeType: "application/json", responseSchema: extractionSchema },
        }));
        if (response.text) {
            const result = JSON.parse(response.text);
            const updatedChars = data.characters.map(orig => {
                const en = (result.characters || []).find((c: any) => c.id === orig.id);
                return en ? { ...orig, age: en.age || orig.age, description: en.description || orig.description, visualMemoryPoints: en.visualMemoryPoints || orig.visualMemoryPoints } : orig;
            });
            const updatedScenes = data.scenes.map(orig => {
                 const en = (result.scenes || []).find((s: any) => s.id === orig.id);
                 return en ? { ...orig, description: en.description || orig.description, atmosphere: en.atmosphere || orig.atmosphere } : orig;
            });
            return { characters: updatedChars, scenes: updatedScenes };
        }
        return data;
    } catch (e) { console.error(e); throw e; }
};

export const splitChaptersRegex = (fullText: string): ChapterMetadata[] => {
    const chapters: ChapterMetadata[] = [];
    // Catch-all for Chinese chapter styles
    const chapterRegex = /(?:^|\n)\s*(第?\s*[一二三四五六七八九十百千万0-9]+\s*[章节回卷集部话][^章节回卷集部话\n]{0,30})(?:\n|$)/g;
    let match;
    const matches: { title: string, index: number }[] = [];

    while ((match = chapterRegex.exec(fullText)) !== null) {
        matches.push({ title: match[1].trim(), index: match.index });
    }

    if (matches.length === 0) {
        return [{ title: "全本正文", summary: "未检测到标识", startLine: fullText.slice(0, 50) }];
    }

    for (let i = 0; i < matches.length; i++) {
        const start = matches[i].index;
        const end = i < matches.length - 1 ? matches[i+1].index : fullText.length;
        const content = fullText.substring(start, end).trim();
        const lines = content.split('\n');
        const startLine = lines.find(l => l.trim().length > 10 && !l.includes(matches[i].title)) || matches[i].title;

        chapters.push({ title: matches[i].title, summary: `第 ${i+1} 章`, startLine: startLine.substring(0, 50) });
    }
    return chapters;
};

export const normalizeTextEntities = (text: string, characters: Character[], scenes: Scene[]): string => {
    let normalized = text;
    const entityMap: { key: string, replacement: string, length: number }[] = [];
    
    characters.forEach(c => {
        entityMap.push({ key: c.name, replacement: `${c.groupName}_${c.name}`, length: c.name.length });
        (c.aliases || []).forEach(a => { if (a.length > 1) entityMap.push({ key: a, replacement: `${c.groupName}_${c.name}`, length: a.length }); });
    });

    scenes.forEach(s => {
        entityMap.push({ key: s.name, replacement: `${s.groupName}_${s.name}`, length: s.name.length });
        (s.aliases || []).forEach(a => { if (a.length > 1) entityMap.push({ key: a, replacement: `${s.groupName}_${s.name}`, length: a.length }); });
    });

    entityMap.sort((a, b) => b.length - a.length);
    entityMap.forEach(item => {
        const regex = new RegExp(item.key, 'g');
        normalized = normalized.replace(regex, item.replacement);
    });
    return normalized;
};

export const generateStoryboard = async (
  chapterText: string,
  context: { characters: Character[], scenes: Scene[] },
  config: PromptConfig
): Promise<Shot[]> => {
  const charContext = context.characters.map(c => `角色: ${c.groupName}_${c.name}\n[特征:${c.visualMemoryPoints}]`).join('\n---\n');
  const sceneContext = context.scenes.map(s => `场景: ${s.groupName}_${s.name}\n[视觉:${s.description}]`).join('\n---\n');
  const basePrompt = config.storyboard || DEFAULT_PROMPTS.storyboard;
  const modelId = config.modelName || DEFAULT_PROMPTS.modelName;
  const ai = getAIClient();
  try {
    const response = await callAIWithRetry<GenerateContentResponse>(() => ai.models.generateContent({
      model: modelId, 
      contents: { parts: [{ text: basePrompt }, { text: `【库】\n${charContext}\n\n${sceneContext}\n\n【文本】:\n${chapterText}` }] },
      config: { responseMimeType: "application/json", responseSchema: storyboardSchema },
    }));
    return response.text ? JSON.parse(response.text).shots : [];
  } catch (error) { console.error(error); throw error; }
};

export const generateCustomExport = async (project: any, formatTemplate: string, instructions: string): Promise<string> => {
    const config = project.prompts || DEFAULT_PROMPTS;
    const leanProject = { title: project.title, characters: project.characters, scenes: project.scenes, storyboards: project.chapters };
    const modelId = config.modelName || DEFAULT_PROMPTS.modelName;
    const ai = getAIClient();
    try {
        const response = await callAIWithRetry<GenerateContentResponse>(() => ai.models.generateContent({
            model: modelId,
            contents: { parts: [{ text: "Format assistant." }, { text: `[JSON]\n${JSON.stringify(leanProject)}` }, { text: `[TEMPLATE]\n${formatTemplate}` }, { text: `[INST]\n${instructions}` }] }
        }));
        return response.text || "";
    } catch (e) { throw new Error("导出失败"); }
}
