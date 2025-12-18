import { GoogleGenAI, Type, Schema, GenerateContentResponse } from "@google/genai";
import { Character, Scene, Chapter, Shot, ChapterMetadata, PromptConfig, VISUAL_AGE_OPTIONS, CHARACTER_ROLES, AnalysisDebugLog } from "../types";

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

async function callAIWithRetry<T>(fn: () => Promise<T>, retries = 5, baseDelay = 5000): Promise<T> {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (e: any) {
      if (i === 0) console.warn("AI Call Failed (Attempt 1), inspecting error:", e);
      const errorCode = e.status || e.code || e.error?.code || e.error?.status;
      const errorMessage = e.message || e.error?.message || JSON.stringify(e);
      const isRateLimit = errorCode === 429 || errorCode === 'RESOURCE_EXHAUSTED' || (typeof errorMessage === 'string' && (errorMessage.includes('429') || errorMessage.includes('quota') || errorMessage.includes('RESOURCE_EXHAUSTED')));
      if (isRateLimit && i < retries - 1) {
        const jitter = Math.random() * 2000;
        const waitTime = baseDelay * Math.pow(2, i) + jitter;
        await delay(waitTime);
        continue;
      }
      if (isRateLimit && i === retries - 1) throw new Error("API 调用过于频繁，已达到重试上限。");
      throw e;
    }
  }
  throw new Error("Max retries reached");
}

export const DEFAULT_PROMPTS: PromptConfig = {
  apiDelay: 4000, 
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
- **Group Name**：**核心身份标识**。必须使用该角色的底层原名（如“唐曾”），即使他被赐名（如“三藏”）或变身，Group Name 必须保持不变，以便跨章节对齐。
- **Name**：使用当前片段中的称呼或形态名称（如“三藏”、“行者孙”）。
- **Role**：根据戏份严格分级 (主要/次要/配角/路人甲)。

【⭐ 武器与服装】
- **Weapons**：仅提取实体武器外观。
- **Clothing**：提取当前穿着。

返回符合 Schema 的 JSON。
`,
  entityEnrichment: `
任务：小说角色与场景数据智能补全
语言：中文 (Chinese)

你将收到一份角色和场景的 JSON 数据。请针对以下情况进行**原地修改和补全**：

1. **外貌/描述缺失 (Missing Visuals)**:
   - 如果 \`visualMemoryPoints\` (外貌) 或 \`description\` (描述) 为空、"未知"、"无法判断"，请根据角色的名称、称呼、职业（如“猎户”、“将军”、“乞丐”）或常规刻板印象进行合理的**创造性补全**。
   - 例子：名为“张猎户”且无描述，应补全为“身穿粗布兽皮衣，皮肤黝黑，背负长弓，肌肉结实，眼神锐利”。
   - 场景同理，如果“破庙”无描述，应补全“残垣断壁，佛像布满蛛网，杂草丛生”。

2. **年龄逻辑修正 (Age Logic)**:
   - 检查 \`age\`。如果当前年龄描述与原文隐含身份冲突（例如身份是“老祖”但填了“青年”），请修正为更合理的年龄段。
   - 优先保留原文明确提到的数字年龄。

3. **保持原样**:
   - 如果数据已经很完善，请不要随意修改，保持原样。

返回完整的、包含所有输入项的 JSON 数据。
`,
  sceneOptimization: `
任务：场景库智能清洗与分级
语言：中文 (Chinese)

你将收到一份场景列表。请执行以下操作：
1. **清洗 (Prune)**：
   - 删除所有类型为“过场”或描述模糊的场景。
   - 删除所有仅提及但未实际发生剧情的场景。
2. **合并 (Merge)**：
   - 将指代同一地点的条目合并（如“张三家”和“张三的卧室”合并为“张三家-卧室”）。
3. **分级与润色 (Classify & Enrich)**：
   - 重新评估 \`type\` (核心据点/剧情节点)。
   - 丰富视觉细节，补充光影和氛围。

返回优化后的场景列表 JSON。
`,
  chapterSplit: "", // Regex handles this
  storyboard: `
任务：作为一名**资深影视分镜导演**，将本章节转化为**极度详细**的影视分镜脚本。
语言：中文 (Chinese)

【上下文感知】
文本中的角色已使用 {角色组}_{形态名} 格式标注。请务必参考角色库中的视觉描述生成视觉提示词。

【时长与密度要求】
1. **时长目标**：本章节对应的视频时长约为 **2分钟**。
2. **镜头数量**：必须输出 **40个以上** 的镜头 (Shots)。
3. **微观拆解**：严禁“一句话一个镜头”。如果原文写“他走过去倒了杯水”，必须拆解为：
   - 镜头A：脚部特写，皮鞋踏在木地板上。
   - 镜头B：手部特写，拿起水壶。
   - 镜头C：水流注入杯子的特写，热气腾腾。
   - 镜头D：中景，他端起杯子喝了一口，喉结滚动。

【核心原则】
1. **纯中文提示词**：所有的视觉提示词(visualPrompt)和视频提示词(videoPrompt)必须使用纯中文描述。
2. **专业镜头语言**：
   - **景别**：多用特写(Close Up)和大特写(ECU)来展现情绪和细节。
   - **视角**：灵活使用仰视、俯视、荷兰角。

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
    customPrompt: string | undefined,
    customDelay: number | undefined,
    onProgress: (percent: number, status: string) => void,
    signal?: AbortSignal
): Promise<{ characters: Character[], scenes: Scene[], debugLog: AnalysisDebugLog[] }> => {
  const CHUNK_SIZE = 50000; 
  const chunks: string[] = [];
  for (let i = 0; i < fullText.length; i += CHUNK_SIZE) chunks.push(fullText.slice(i, i + CHUNK_SIZE));

  const charMap = new Map<string, Character>(); 
  const sceneMap = new Map<string, Scene>(); 
  const debugLogs: AnalysisDebugLog[] = [];
  const basePrompt = (customPrompt && customPrompt.trim().length > 0) ? customPrompt : DEFAULT_PROMPTS.entityExtraction;
  const pacingDelay = customDelay || DEFAULT_PROMPTS.apiDelay || 4000;
  const ai = getAIClient();

  for (let i = 0; i < chunks.length; i++) {
    if (signal?.aborted) throw new Error("Analysis cancelled");
    const chunk = chunks[i];
    const progress = Math.round(((i) / chunks.length) * 100);
    const startTime = Date.now(); 
    onProgress(progress, `正在分析第 ${i + 1}/${chunks.length} 部分...`);

    let contextStr = "";
    if (charMap.size > 0 || sceneMap.size > 0) {
        const charGroups: Record<string, string[]> = {};
        charMap.forEach(c => { if(!charGroups[c.groupName]) charGroups[c.groupName] = []; charGroups[c.groupName].push(c.name); });
        const charContextList = Object.entries(charGroups).map(([group, forms]) => `• 分组[${group}]: 包含形态 {${forms.join(', ')}}`).join('\n');
        const sceneGroups: Record<string, string[]> = {};
        sceneMap.forEach(s => { if(!sceneGroups[s.groupName]) sceneGroups[s.groupName] = []; sceneGroups[s.groupName].push(s.name); });
        const sceneContextList = Object.entries(sceneGroups).map(([group, areas]) => `• 地点[${group}]: 包含区域 {${areas.join(', ')}}`).join('\n');
        contextStr = `\n\n【已知实体列表】\n--- 已知角色架构 ---\n${charContextList}\n\n--- 已知场景架构 ---\n${sceneContextList}`;
    }

    try {
        const response = await callAIWithRetry<GenerateContentResponse>(() => ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: { parts: [{ text: basePrompt }, { text: contextStr }, { text: `文本片段:\n${chunk}` }] },
            config: { responseMimeType: "application/json", responseSchema: extractionSchema },
        }));
        const rawText = response.text || "";
        let parsedData = JSON.parse(rawText);
        debugLogs.push({ timestamp: new Date().toISOString(), chunkIndex: i, rawResponse: rawText, parsedData, usedPrompt: i === 0 ? basePrompt : undefined });

        if (Array.isArray(parsedData.characters)) {
            parsedData.characters.forEach(c => {
                const group = c.groupName || "未命名分组";
                const name = c.name || "未命名角色";
                const key = normalizeKey(group) + "_" + normalizeKey(name);
                const existing = charMap.get(key);
                if (existing) {
                    charMap.set(key, { ...existing, aliases: Array.from(new Set([...existing.aliases, ...(c.aliases || [])])), weapons: [...(existing.weapons || []), ...(c.weapons || [])], clothingStyles: [...existing.clothingStyles, ...(c.clothingStyles || [])] });
                } else {
                    charMap.set(key, { ...c, id: generateId(), groupName: group, name });
                }
            });
        }
        if (Array.isArray(parsedData.scenes)) {
             parsedData.scenes.forEach(s => {
                    const group = s.groupName || "未命名地点";
                    const name = s.name || "未命名场景";
                    const key = normalizeKey(group) + "_" + normalizeKey(name);
                    const existing = sceneMap.get(key);
                    if (existing) sceneMap.set(key, { ...existing, frequency: (existing.frequency || 1) + (s.frequency || 1) });
                    else sceneMap.set(key, { ...s, id: generateId(), groupName: group, name });
            });
        }
        const waitTime = Math.max(0, pacingDelay - (Date.now() - startTime));
        if (waitTime > 0) await delay(waitTime);
    } catch (e: any) {
        if (signal?.aborted) throw new Error("Analysis cancelled");
        console.error(`Chunk ${i} failed`, e);
    }
  }
  return { characters: Array.from(charMap.values()), scenes: Array.from(sceneMap.values()), debugLog: debugLogs };
};

export const enrichEntities = async (
    data: { characters: Character[], scenes: Scene[] },
    customPrompt: string | undefined
): Promise<{ characters: Character[], scenes: Scene[] }> => {
    const basePrompt = customPrompt || DEFAULT_PROMPTS.entityEnrichment;
    const ai = getAIClient();
    try {
        const response = await callAIWithRetry<GenerateContentResponse>(() => ai.models.generateContent({
            model: "gemini-2.5-flash",
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

/**
 * Regex-based Chapter Splitting
 * Enhanced to handle "一章一节", "第一章" and other variations more reliably.
 */
export const splitChaptersRegex = (fullText: string): ChapterMetadata[] => {
    const chapters: ChapterMetadata[] = [];
    // More robust regex for common Chinese chapter patterns
    const chapterRegex = /(?:^|\n)\s*(第?\s*[一二三四五六七八九十百千万0-9]+\s*[章节回卷集部话][^章节回卷集部话\n]{0,30})(?:\n|$)/g;
    let match;
    const matches: { title: string, index: number }[] = [];

    while ((match = chapterRegex.exec(fullText)) !== null) {
        matches.push({ title: match[1].trim(), index: match.index });
    }

    if (matches.length === 0) {
        return [{ title: "全本正文", summary: "未检测到章节标识，提取全文。", startLine: fullText.slice(0, 50) }];
    }

    for (let i = 0; i < matches.length; i++) {
        const start = matches[i].index;
        const end = i < matches.length - 1 ? matches[i+1].index : fullText.length;
        const content = fullText.substring(start, end).trim();
        // Finding a non-header line for better matching later
        const lines = content.split('\n');
        const startLine = lines.find(l => l.trim().length > 10 && !l.includes(matches[i].title)) || matches[i].title;

        chapters.push({
            title: matches[i].title,
            summary: `第 ${i+1} 章节`,
            startLine: startLine.substring(0, 50)
        });
    }
    return chapters;
};

/**
 * Normalize Chapter Entities: Replaces aliases with GroupName_FormName
 */
export const normalizeTextEntities = (text: string, characters: Character[], scenes: Scene[]): string => {
    let normalized = text;
    
    // Create mapping pairs (alias -> Group_Name)
    const entityMap: { key: string, replacement: string, length: number }[] = [];
    
    characters.forEach(c => {
        // Form name replacement
        entityMap.push({ key: c.name, replacement: `${c.groupName}_${c.name}`, length: c.name.length });
        // Alias replacements
        (c.aliases || []).forEach(a => {
            if (a.length > 1) entityMap.push({ key: a, replacement: `${c.groupName}_${c.name}`, length: a.length });
        });
    });

    scenes.forEach(s => {
        // Area name replacement
        entityMap.push({ key: s.name, replacement: `${s.groupName}_${s.name}`, length: s.name.length });
        // Alias replacements
        (s.aliases || []).forEach(a => {
            if (a.length > 1) entityMap.push({ key: a, replacement: `${s.groupName}_${s.name}`, length: a.length });
        });
    });

    // Sort by length descending to replace longest matches first (e.g. "孙悟空" before "悟空")
    entityMap.sort((a, b) => b.length - a.length);

    // Use a temporary map to avoid double replacement issues (e.g. replacing parts of already replaced strings)
    // For simplicity, we iterate and replace, but the sorted order handles the most critical nesting cases.
    entityMap.forEach(item => {
        const regex = new RegExp(item.key, 'g');
        normalized = normalized.replace(regex, item.replacement);
    });

    return normalized;
};

export const generateStoryboard = async (
  chapterText: string,
  context: { characters: Character[], scenes: Scene[] },
  customPrompt: string | undefined
): Promise<Shot[]> => {
  const charContext = context.characters.map(c => `角色: ${c.groupName}_${c.name}\n[外貌:${c.visualMemoryPoints}]`).join('\n---\n');
  const sceneContext = context.scenes.map(s => `场景: ${s.groupName}_${s.name}\n[描述:${s.description}]`).join('\n---\n');
  const basePrompt = customPrompt || DEFAULT_PROMPTS.storyboard;
  const ai = getAIClient();
  try {
    const response = await callAIWithRetry<GenerateContentResponse>(() => ai.models.generateContent({
      model: "gemini-2.5-flash", 
      contents: { parts: [{ text: basePrompt }, { text: `【视觉库参考】\n${charContext}\n\n${sceneContext}\n\n【正文文本】:\n${chapterText}` }] },
      config: { responseMimeType: "application/json", responseSchema: storyboardSchema },
    }));
    return response.text ? JSON.parse(response.text).shots : [];
  } catch (error) { console.error(error); throw error; }
};

export const generateCustomExport = async (project: any, formatTemplate: string, instructions: string): Promise<string> => {
    const leanProject = { title: project.title, characters: project.characters, scenes: project.scenes, storyboards: project.chapters };
    const ai = getAIClient();
    try {
        const response = await callAIWithRetry<GenerateContentResponse>(() => ai.models.generateContent({
            model: "gemini-3-pro-preview",
            contents: { parts: [{ text: "JSON formatter assistant." }, { text: `[JSON]\n${JSON.stringify(leanProject)}` }, { text: `[FORMAT]\n${formatTemplate}` }, { text: `[INST]\n${instructions}` }] }
        }));
        return response.text || "";
    } catch (e) { throw new Error("导出失败"); }
}
