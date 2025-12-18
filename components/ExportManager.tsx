import React, { useState } from 'react';
import { Project } from '../types';
import { generateCustomExport } from '../services/geminiService';
import { Download, FileJson, Sparkles, AlertCircle, Copy, Check, Terminal, Play } from 'lucide-react';

interface ExportManagerProps {
  project: Project;
}

const DEFAULT_TEMPLATE = `
请按照以下 JSON 格式输出：
{
  "actors": [
     { "name": "{{角色名}}", "prompt": "{{视觉特征}}" }
  ],
  "locations": [
     { "name": "{{场景名}}", "prompt": "{{场景描述}}" }
  ],
  "sequences": [
     { 
       "chapter": "{{章节名}}",
       "shots": [
          { "id": "{{镜头ID}}", "visual": "{{画面提示词}}", "camera": "{{运镜提示词}}" }
       ]
     }
  ]
}
`;

export const ExportManager: React.FC<ExportManagerProps> = ({ project }) => {
  const [template, setTemplate] = useState(DEFAULT_TEMPLATE);
  const [instructions, setInstructions] = useState("请保持 JSON 格式合法。所有提示词请翻译成英文以便对接 Midjourney。");
  const [output, setOutput] = useState("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleGenerate = async () => {
      setLoading(true);
      setOutput("");
      try {
          // This calls the service which strips fullText before sending to AI
          const result = await generateCustomExport(project, template, instructions);
          setOutput(result);
      } catch (e: any) {
          setOutput(`Error: ${e.message}`);
      } finally {
          setLoading(false);
      }
  };

  const handleDownload = () => {
      if (!output) return;
      const blob = new Blob([output], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${project.title}_export.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
  };

  const handleCopy = () => {
      navigator.clipboard.writeText(output);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
  };

  // Stats for the "Lean Data" view
  const charCount = (project.characters || []).length;
  const sceneCount = (project.scenes || []).length;
  const shotCount = (project.chapters || []).reduce((acc, ch) => acc + (ch.storyboard?.length || 0), 0);

  return (
    <div className="h-full flex flex-col p-8 max-w-6xl mx-auto w-full">
        <div className="flex justify-between items-center mb-6">
            <div>
                <h2 className="text-2xl font-bold text-white mb-1 flex items-center gap-2">
                    <Terminal className="w-6 h-6 text-indigo-400"/> 智能导出中心 (AI Exporter)
                </h2>
                <p className="text-gray-400 text-sm">利用 AI 将角色、场景和分镜数据转换为您需要的任意格式。</p>
            </div>
            
            <div className="flex gap-2 text-xs bg-gray-900 border border-gray-800 px-3 py-1.5 rounded-lg">
                <span className="text-gray-500">待处理数据源:</span>
                <span className="text-indigo-400 font-bold">{charCount} 角色</span>
                <span className="text-gray-700">|</span>
                <span className="text-emerald-400 font-bold">{sceneCount} 场景</span>
                <span className="text-gray-700">|</span>
                <span className="text-purple-400 font-bold">{shotCount} 镜头</span>
            </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 flex-1 overflow-hidden">
            {/* Left Column: Configuration */}
            <div className="flex flex-col gap-4 overflow-y-auto pr-2">
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 shadow-sm">
                    <label className="block text-sm font-bold text-gray-300 mb-2 flex items-center gap-2">
                        <FileJson className="w-4 h-4 text-indigo-400"/>
                        1. 标准格式模板 (Target Format)
                    </label>
                    <p className="text-xs text-gray-500 mb-3">
                        请在此粘贴您需要的最终格式示例。可以是 JSON 结构、XML、CSV 表头或者特定的 Markdown 排版。
                    </p>
                    <textarea 
                        value={template}
                        onChange={(e) => setTemplate(e.target.value)}
                        className="w-full h-64 bg-gray-950 border border-gray-800 rounded-lg p-3 font-mono text-xs text-gray-300 focus:border-indigo-500 outline-none resize-none leading-relaxed"
                        placeholder="在此粘贴目标格式..."
                    />
                </div>

                <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 shadow-sm flex-1">
                    <label className="block text-sm font-bold text-gray-300 mb-2 flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-emerald-400"/>
                        2. 辅助指令 (Instructions)
                    </label>
                    <p className="text-xs text-gray-500 mb-3">
                        告诉 AI 需要注意什么。例如：“翻译成英文”、“去除所有标点”、“按场景分组”等。
                    </p>
                    <textarea 
                        value={instructions}
                        onChange={(e) => setInstructions(e.target.value)}
                        className="w-full h-32 bg-gray-950 border border-gray-800 rounded-lg p-3 font-mono text-xs text-gray-300 focus:border-emerald-500 outline-none resize-none leading-relaxed"
                    />
                    
                    <div className="mt-4 bg-yellow-900/10 border border-yellow-900/30 p-3 rounded text-xs text-yellow-500/80 flex gap-2">
                        <AlertCircle className="w-4 h-4 flex-shrink-0" />
                        <p>注意：为了防止内存溢出，系统会在后台自动剔除小说全文和章节原文，仅发送已生成的设定和分镜数据给 AI 进行格式化。</p>
                    </div>

                    <button 
                        onClick={handleGenerate}
                        disabled={loading}
                        className="w-full mt-4 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white py-3 rounded-lg font-bold shadow-lg transition-all flex items-center justify-center gap-2"
                    >
                        {loading ? <span className="animate-spin">⏳</span> : <Play className="w-4 h-4 fill-current"/>}
                        {loading ? '正在转换格式...' : '开始生成导出数据'}
                    </button>
                </div>
            </div>

            {/* Right Column: Output */}
            <div className="flex flex-col bg-gray-900 border border-gray-800 rounded-xl overflow-hidden shadow-lg">
                <div className="bg-gray-950 px-4 py-3 border-b border-gray-800 flex justify-between items-center">
                    <span className="text-sm font-bold text-gray-300">生成结果 (Output)</span>
                    <div className="flex gap-2">
                        <button 
                            onClick={handleCopy}
                            disabled={!output}
                            className="text-xs flex items-center gap-1 bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-1.5 rounded transition-colors disabled:opacity-30"
                        >
                            {copied ? <Check className="w-3 h-3 text-green-500"/> : <Copy className="w-3 h-3"/>}
                            复制
                        </button>
                        <button 
                            onClick={handleDownload}
                            disabled={!output}
                            className="text-xs flex items-center gap-1 bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded transition-colors disabled:opacity-30"
                        >
                            <Download className="w-3 h-3"/>
                            下载文件
                        </button>
                    </div>
                </div>
                <textarea 
                    value={output}
                    readOnly
                    className="flex-1 w-full bg-gray-950/50 p-4 font-mono text-xs text-gray-300 outline-none resize-none"
                    placeholder="等待生成..."
                />
            </div>
        </div>
    </div>
  );
};
