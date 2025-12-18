import React, { useState, useEffect } from 'react';
import { Project, PromptConfig, AVAILABLE_MODELS } from '../types';
import { DEFAULT_PROMPTS } from '../services/geminiService';
import { Save, RotateCcw, Info, Settings2, Key, ShieldCheck, Eye, EyeOff, Gauge, Check, Cpu, Zap, Activity, AlertCircle } from 'lucide-react';

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
    setConfig(project.prompts || DEFAULT_PROMPTS);
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
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 text-indigo-400 mb-1">
              <Settings2 className="w-5 h-5" />
              <span className="text-xs uppercase font-bold tracking-wider">Configuration</span>
          </div>
          <h2 className="text-2xl font-bold text-white mb-1">系统设置 & 频率控制</h2>
          <p className="text-gray-400 text-sm">选择 AI 模型并优化请求间隔，以应对 API 频率限制。</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto space-y-8 pr-4 pb-20 custom-scrollbar">
        {/* API Key Section */}
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
                        placeholder="在此输入您的 API Key..."
                        className={`w-full bg-gray-950 border ${keySaved ? 'border-green-900/50 text-green-100' : 'border-gray-700 text-white'} rounded-lg px-4 py-2.5 outline-none focus:border-indigo-500 transition-all`}
                    />
                    <button 
                        onClick={() => setShowKey(!showKey)}
                        className="absolute right-3 top-2.5 text-gray-500 hover:text-gray-300"
                    >
                        {showKey ? <EyeOff className="w-4 h-4"/> : <Eye className="w-4 h-4"/>}
                    </button>
                </div>
                <button onClick={handleSaveApiKey} className={`px-4 py-2 rounded-lg font-medium transition-all ${keySaved ? 'bg-green-600 text-white' : 'bg-indigo-600 text-white'}`}>
                    {keySaved ? <ShieldCheck className="w-4 h-4"/> : <Save className="w-4 h-4"/>}
                </button>
            </div>
        </div>

        {/* Model Selector Section */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 shadow-lg shadow-black/20">
            <div className="flex items-center gap-3 mb-6 border-b border-gray-800 pb-2">
                <Cpu className="w-5 h-5 text-indigo-400" />
                <h3 className="text-lg font-semibold text-white">模型选择 (Model Selection)</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {AVAILABLE_MODELS.map(model => (
                    <div 
                        key={model.id}
                        onClick={() => setConfig({...config, modelName: model.id})}
                        className={`cursor-pointer group relative bg-gray-950 border-2 rounded-xl p-4 transition-all hover:shadow-xl ${config.modelName === model.id ? 'border-indigo-500 ring-1 ring-indigo-500/50' : 'border-gray-800 hover:border-gray-600'}`}
                    >
                        <div className="flex justify-between items-start mb-2">
                            <h4 className={`font-bold text-sm ${config.modelName === model.id ? 'text-indigo-400' : 'text-gray-200'}`}>{model.name}</h4>
                            {config.modelName === model.id && <Zap className="w-3.5 h-3.5 text-indigo-400 fill-indigo-400" />}
                        </div>
                        <p className="text-[11px] text-gray-400 mb-3 leading-tight">{model.description}</p>
                        
                        <div className="space-y-1 mb-3">
                            <div className="flex items-center gap-1">
                                <Activity className="w-3 h-3 text-emerald-500" />
                                <span className="text-[10px] text-gray-500">限频: {model.rpmLimit} 次/分钟</span>
                            </div>
                            <div className="flex items-center gap-1">
                                <AlertCircle className="w-3 h-3 text-indigo-400" />
                                <span className="text-[10px] text-gray-500">分块: {(model.maxChunkChars/1000).toFixed(0)}k 字符</span>
                            </div>
                        </div>

                        <div className="flex flex-wrap gap-1 mt-auto">
                            {model.tags.map(tag => (
                                <span key={tag} className="text-[9px] bg-indigo-900/20 text-indigo-400 px-1.5 py-0.5 rounded border border-indigo-900/30">{tag}</span>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>

        {/* Rate Limit Control */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 shadow-lg shadow-black/20">
            <div className="flex items-center gap-3 mb-4 border-b border-gray-800 pb-2">
                <Gauge className="w-5 h-5 text-emerald-500" />
                <h3 className="text-lg font-semibold text-white">请求冷却间隔 (Safety Delay)</h3>
            </div>
            <div className="space-y-4">
                <div>
                    <div className="flex justify-between text-sm mb-2">
                        <span className="text-gray-400">单次请求后最小等待时长</span>
                        <span className="text-emerald-400 font-bold">{(config.apiDelay || 5000) / 1000} 秒</span>
                    </div>
                    <input 
                        type="range" 
                        min="1000" 
                        max="30000" 
                        step="1000"
                        value={config.apiDelay || 5000}
                        onChange={(e) => setConfig({...config, apiDelay: parseInt(e.target.value)})}
                        className="w-full h-2 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                    />
                    <div className="mt-4 p-3 bg-indigo-950/20 border border-indigo-900/30 rounded-lg">
                        <p className="text-xs text-indigo-300 leading-relaxed">
                            <span className="font-bold">推荐设置:</span><br/>
                            - Flash 模型 (免费层级): 4 - 6 秒<br/>
                            - Pro 模型 (免费层级): 30 秒 (Gemini Pro 限制为 2 RPM)
                        </p>
                    </div>
                </div>
            </div>
        </div>

        {/* Prompt Management */}
        <div className="flex items-center justify-between mt-8 border-t border-gray-800 pt-8">
            <h3 className="text-xl font-bold text-white">提示词设置 (Prompts)</h3>
            <div className="flex gap-3">
                <button onClick={handleResetPrompts} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-800 text-gray-300 hover:bg-gray-700 transition-colors text-sm border border-gray-700">
                    <RotateCcw className="w-4 h-4" /> 重置默认
                </button>
                <button onClick={handleSavePrompts} className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all text-sm font-medium shadow-lg ${saveStatus === 'saved' ? 'bg-green-600 text-white' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}>
                    {saveStatus === 'saved' ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />} 
                    {saveStatus === 'saved' ? '✓ 配置已保存' : '保存配置'}
                </button>
            </div>
        </div>

        <div className="space-y-6">
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                <h3 className="text-lg font-semibold text-gray-200 mb-4">设定提取 (Entity Extraction)</h3>
                <textarea 
                    value={config.entityExtraction}
                    onChange={(e) => setConfig({...config, entityExtraction: e.target.value})}
                    className="w-full h-80 bg-gray-950 border border-gray-800 rounded-lg p-4 font-mono text-xs text-gray-300 focus:border-indigo-500 outline-none leading-relaxed"
                />
            </div>
        </div>
      </div>
    </div>
  );
};