import React, { useState, useEffect } from 'react';
import { Project, PromptConfig } from '../types';
import { DEFAULT_PROMPTS } from '../services/geminiService';
import { Save, RotateCcw, Info, Settings2, Key, ShieldCheck, Eye, EyeOff, Gauge, Check } from 'lucide-react';

interface SettingsViewProps {
  project: Project;
  onUpdateProject: (p: Project) => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ project, onUpdateProject }) => {
  const [config, setConfig] = useState<PromptConfig>(project.prompts || DEFAULT_PROMPTS);
  
  // API Key State
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [keySaved, setKeySaved] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved'>('idle');

  useEffect(() => {
    // Load current config from project or default
    setConfig(project.prompts || DEFAULT_PROMPTS);
    
    // Load API Key from local storage
    const savedKey = localStorage.getItem('custom_gemini_api_key');
    if (savedKey) {
        setApiKey(savedKey);
        setKeySaved(true);
    }
  }, [project.id, project.prompts]);

  const handleSavePrompts = () => {
    onUpdateProject({
      ...project,
      prompts: config
    });
    setSaveStatus('saved');
    setTimeout(() => setSaveStatus('idle'), 2000);
  };

  const handleResetPrompts = () => {
    if (window.confirm("确定要重置为最新的系统默认设置吗？")) {
      setConfig(DEFAULT_PROMPTS);
      onUpdateProject({
          ...project,
          prompts: DEFAULT_PROMPTS
      });
    }
  };

  const handleSaveApiKey = () => {
      if (!apiKey.trim()) {
          localStorage.removeItem('custom_gemini_api_key');
          setKeySaved(false);
          alert("API Key 已清除。");
          return;
      }
      localStorage.setItem('custom_gemini_api_key', apiKey.trim());
      setKeySaved(true);
      alert("API Key 已保存！");
  }

  return (
    <div className="h-full flex flex-col max-w-4xl mx-auto w-full p-6">
      
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 text-indigo-400 mb-1">
              <Settings2 className="w-5 h-5" />
              <span className="text-xs uppercase font-bold tracking-wider">Settings</span>
          </div>
          <h2 className="text-2xl font-bold text-white mb-1">系统设置 & 提示词工程</h2>
          <p className="text-gray-400 text-sm">自定义 API 连接策略与 AI 生成逻辑。</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto space-y-8 pr-4 pb-20">
        
        {/* API Strategy Section */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 shadow-lg shadow-black/20">
                <div className="flex items-center gap-3 mb-4 border-b border-gray-800 pb-2">
                    <Key className="w-5 h-5 text-yellow-500" />
                    <h3 className="text-lg font-semibold text-white">Gemini API Key</h3>
                </div>
                <div className="flex gap-3">
                    <div className="relative flex-1">
                        <input 
                            type={showKey ? "text" : "password"}
                            value={apiKey}
                            onChange={(e) => { setApiKey(e.target.value); setKeySaved(false); }}
                            placeholder="Enter Gemini API Key..."
                            className={`w-full bg-gray-950 border ${keySaved ? 'border-green-900/50 text-green-100' : 'border-gray-700 text-white'} rounded-lg px-4 py-2.5 outline-none focus:border-indigo-500 transition-all`}
                        />
                        <button 
                            onClick={() => setShowKey(!showKey)}
                            className="absolute right-3 top-2.5 text-gray-500 hover:text-gray-300"
                        >
                            {showKey ? <EyeOff className="w-4 h-4"/> : <Eye className="w-4 h-4"/>}
                        </button>
                    </div>
                    <button 
                        onClick={handleSaveApiKey}
                        className={`px-4 py-2 rounded-lg font-medium transition-all ${keySaved ? 'bg-green-600 text-white' : 'bg-indigo-600 text-white'}`}
                    >
                        {keySaved ? <ShieldCheck className="w-4 h-4"/> : <Save className="w-4 h-4"/>}
                    </button>
                </div>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 shadow-lg shadow-black/20">
                <div className="flex items-center gap-3 mb-4 border-b border-gray-800 pb-2">
                    <Gauge className="w-5 h-5 text-emerald-500" />
                    <h3 className="text-lg font-semibold text-white">API 请求配额控制 (Rate Limiting)</h3>
                </div>
                <div className="space-y-4">
                    <div>
                        <div className="flex justify-between text-sm mb-2">
                            <span className="text-gray-400">最小请求间隔 (Min Request Interval)</span>
                            <span className="text-emerald-400 font-bold">{(config.apiDelay || 4000) / 1000} 秒</span>
                        </div>
                        <input 
                            type="range" 
                            min="1000" 
                            max="10000" 
                            step="500"
                            value={config.apiDelay || 4000}
                            onChange={(e) => setConfig({...config, apiDelay: parseInt(e.target.value)})}
                            className="w-full h-2 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                        />
                        <p className="text-xs text-gray-500 mt-2">
                            Gemini 免费版每分钟限制约 15 次请求 (即每 4 秒 1 次)。<br/>
                            <span className="text-emerald-400/80">智能控制：如果 AI 处理时间超过了设定间隔，将自动跳过等待。</span><br/>
                            如果频繁遇到 429 错误，请适当调大此数值。
                        </p>
                    </div>
                </div>
            </div>
        </div>

        {/* Prompt Header */}
        <div className="flex items-center justify-between mt-8 border-t border-gray-800 pt-8">
            <h3 className="text-xl font-bold text-white">提示词工程 (Prompt Engineering)</h3>
            <div className="flex gap-3">
                <button 
                    onClick={handleResetPrompts}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-800 text-gray-300 hover:bg-gray-700 transition-colors text-sm border border-gray-700"
                >
                    <RotateCcw className="w-4 h-4" /> 重置默认
                </button>
                <button 
                    onClick={handleSavePrompts}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all text-sm font-medium shadow-lg ${saveStatus === 'saved' ? 'bg-green-600 text-white' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}
                >
                    {saveStatus === 'saved' ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />} 
                    {saveStatus === 'saved' ? '✓ 已应用配置 (Configuration Applied)' : '保存修改'}
                </button>
            </div>
        </div>

        {/* Prompts Editors */}
        <div className="space-y-6">
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                <div className="flex items-center gap-3 mb-4">
                    <div className="w-8 h-8 rounded-full bg-blue-900/50 text-blue-400 flex items-center justify-center font-bold">1</div>
                    <h3 className="text-lg font-semibold text-gray-200">设定提取 (Entity Extraction)</h3>
                </div>
                <textarea 
                    value={config.entityExtraction}
                    onChange={(e) => setConfig({...config, entityExtraction: e.target.value})}
                    className="w-full h-96 bg-gray-950 border border-gray-800 rounded-lg p-4 font-mono text-sm text-gray-300 focus:border-indigo-500 outline-none leading-relaxed"
                />
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                <div className="flex items-center gap-3 mb-4">
                    <div className="w-8 h-8 rounded-full bg-purple-900/50 text-purple-400 flex items-center justify-center font-bold">2</div>
                    <h3 className="text-lg font-semibold text-gray-200">智能补全逻辑 (Entity Enrichment)</h3>
                </div>
                <textarea 
                    value={config.entityEnrichment || DEFAULT_PROMPTS.entityEnrichment}
                    onChange={(e) => setConfig({...config, entityEnrichment: e.target.value})}
                    className="w-full h-64 bg-gray-950 border border-gray-800 rounded-lg p-4 font-mono text-sm text-gray-300 focus:border-indigo-500 outline-none leading-relaxed"
                />
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                <div className="flex items-center gap-3 mb-4">
                    <div className="w-8 h-8 rounded-full bg-emerald-900/50 text-emerald-400 flex items-center justify-center font-bold">3</div>
                    <h3 className="text-lg font-semibold text-gray-200">场景库清洗 (Scene Optimization)</h3>
                </div>
                <textarea 
                    value={config.sceneOptimization || DEFAULT_PROMPTS.sceneOptimization}
                    onChange={(e) => setConfig({...config, sceneOptimization: e.target.value})}
                    className="w-full h-64 bg-gray-950 border border-gray-800 rounded-lg p-4 font-mono text-sm text-gray-300 focus:border-indigo-500 outline-none leading-relaxed"
                />
            </div>
        </div>

      </div>
    </div>
  );
};