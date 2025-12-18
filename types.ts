export interface Project {
  id: string;
  title: string;
  createdAt: number;
  fullText: string;
  characters: Character[];
  scenes: Scene[];
  chapters: Chapter[];
  prompts?: PromptConfig; // User customizable prompts
  debugLog?: AnalysisDebugLog[]; // New: Store analysis logs
}

export interface AnalysisDebugLog {
  timestamp: string;
  chunkIndex: number;
  rawResponse: string;
  parsedData: any;
  error?: string;
  usedPrompt?: string; // New: Verify which prompt was actually used
}

export interface PromptConfig {
  entityExtraction: string;
  entityEnrichment: string; // New: Prompt for smart completion
  chapterSplit: string;
  storyboard: string;
  exportFormat?: string; 
  sceneOptimization?: string; 
  apiDelay?: number; 
}

export interface ClothingStyle {
  phase: string; 
  description: string;
}

export interface Weapon {
  name: string;
  description: string;
}

export type CharacterRole = '主要角色' | '次要角色' | '配角' | '路人甲';

export interface Character {
  id: string; 
  groupName: string; // 角色本体名称 (如：孙悟空)
  name: string; // 具体形态名称 (如：孙悟空-行者形态)
  aliases: string[]; // 别名 (归属于 groupName，但在形态里展示方便编辑)
  role: CharacterRole; // 新增：角色重要性分级
  
  age: string; // 视觉年龄
  
  // General
  description: string; // 性格、背景、身份、性别等文本描述 (长篇描述，跨越形态)
  visualMemoryPoints: string; // 纯粹的生理外貌特征 (不含武器)
  clothingStyles: ClothingStyle[];
  weapons: Weapon[]; // 新增：武器列表
}

export interface Scene {
  id: string; 
  groupName: string; 
  name: string; 
  aliases: string[];
  description: string; // 具体描述
  structure: '内景' | '外景'; 
  atmosphere: string; 
  style: string; 
  frequency?: number; // 新增：出现频次/重要性权重
  type?: '核心据点' | '剧情节点' | '过场'; // New: Scene classification
}

export interface Chapter {
  id: string;
  title: string;
  summary: string;
  content: string; 
  storyboard: Shot[];
}

export interface ChapterMetadata {
  title: string;
  summary: string;
  startLine: string;
  endLine?: string;
}

export interface Shot {
  id: string; 
  speaker: string; 
  script: string; 
  visualPrompt: string; 
  videoPrompt: string; 
  
  // Camera specific
  shotType: string; // 景别 (Shot Size) e.g. 大特写, 中景
  angle: string;    // 视角 (Angle) e.g. 仰视, 俯视, 平视
  
  audio: string; 
  sfx: string; 
}

export enum AppView {
  PROJECT_SELECT = 'PROJECT_SELECT',
  ANALYSIS = 'ANALYSIS',
  CHAPTERS = 'CHAPTERS',
  STORYBOARD = 'STORYBOARD',
  SETTINGS = 'SETTINGS',
  EXPORT = 'EXPORT'
}

export const VISUAL_AGE_OPTIONS = [
  "幼年 (0-6岁)",
  "少年 (7-14岁)",
  "青年 (15-25岁)",
  "壮年 (26-40岁)",
  "中年 (41-60岁)",
  "老年 (60岁以上)",
  "古稀/耄耋 (80岁以上)",
  "外表无法判断"
];

export const CHARACTER_ROLES: CharacterRole[] = [
  '主要角色',
  '次要角色',
  '配角',
  '路人甲'
];

export const SHOT_TYPE_OPTIONS = [
  "大特写 (Extreme Close Up)",
  "特写 (Close Up)",
  "近景 (Medium Close Up)",
  "中景 (Medium Shot)",
  "全景 (Full Shot)",
  "远景 (Long Shot)",
  "大远景 (Extreme Long Shot)"
];

export const ANGLE_OPTIONS = [
  "平视 (Eye Level)",
  "仰视 (Low Angle)",
  "俯视 (High Angle)",
  "顶视 (Overhead)",
  "荷兰角 (Dutch Angle)",
  "过肩镜头 (Over the Shoulder)",
  "主观视角 (POV)"
];