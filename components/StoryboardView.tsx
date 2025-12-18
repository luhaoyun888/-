import React, { useState } from 'react';
import { Project, Chapter, Shot, ANGLE_OPTIONS, SHOT_TYPE_OPTIONS } from '../types';
// Import DEFAULT_PROMPTS as a configuration fallback
import { generateStoryboard, DEFAULT_PROMPTS } from '../services/geminiService';
import { ArrowLeft, Clapperboard, Video, Image as ImageIcon, Mic, Sparkles, Loader2, Copy, Check, Eye, EyeOff, Edit2, Trash2, Plus, Save, X } from 'lucide-react';

interface StoryboardViewProps {
  project: Project;
  chapterId: string;
  onBack: () => void;
  onUpdateProject: (p: Project) => void;
}

const getTempId = () => Math.random().toString(36).substring(7);

export const StoryboardView: React.FC<StoryboardViewProps> = ({ project, chapterId, onBack, onUpdateProject }) => {
  const chapter = project.chapters.find(c => c.id === chapterId);
  const [loading, setLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showText, setShowText] = useState(false);

  // Edit State
  const [editingShot, setEditingShot] = useState<Shot | null>(null);
  const [isNew, setIsNew] = useState(false);

  if (!chapter) return null;

  const handleGenerate = async () => {
    setLoading(true);
    try {
      // Pass the full PromptConfig object (project.prompts or fallback) to satisfy generateStoryboard's interface
      const shots = await generateStoryboard(
          chapter.content, 
          {
            characters: project.characters || [],
            scenes: project.scenes || []
          },
          project.prompts || DEFAULT_PROMPTS
      );
      
      const updatedChapters = project.chapters.map(c => 
        c.id === chapterId ? { ...c, storyboard: shots } : c
      );

      onUpdateProject({ ...project, chapters: updatedChapters });
    } catch (e) {
      alert("生成分镜失败: " + e);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleDeleteShot = (id: string) => {
      if(!window.confirm("确定删除这个镜头吗？")) return;
      const updatedShots = (chapter.storyboard || []).filter(s => s.id !== id);
      const updatedChapters = project.chapters.map(c => c.id === chapterId ? { ...c, storyboard: updatedShots } : c);
      onUpdateProject({ ...project, chapters: updatedChapters });
  };

  const saveShot = (shot: Shot) => {
      let updatedShots = [...(chapter.storyboard || [])];
      if (isNew) {
          updatedShots.push(shot);
      } else {
          updatedShots = updatedShots.map(s => s.id === shot.id ? shot : s);
      }
      const updatedChapters = project.chapters.map(c => c.id === chapterId ? { ...c, storyboard: updatedShots } : c);
      onUpdateProject({ ...project, chapters: updatedChapters });
      setEditingShot(null);
      setIsNew(false);
  };

  const hasShots = (chapter.storyboard?.length || 0) > 0;

  return (
    <div className="h-full flex flex-col bg-gray-950">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-800 pb-4 mb-4">
        <div className="flex items-center gap-4">
          <button 
            onClick={onBack}
            className="p-2 hover:bg-gray-800 rounded-lg text-gray-400 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
                {chapter.title} 
                <span className="text-sm font-normal text-gray-500 bg-gray-900 px-2 py-0.5 rounded border border-gray-800">分镜脚本</span>
            </h2>
          </div>
        </div>
        
        <div className="flex gap-3">
            <button
                onClick={() => setShowText(!showText)}
                className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-2 rounded-lg font-medium transition-all"
            >
                {showText ? <EyeOff className="w-4 h-4"/> : <Eye className="w-4 h-4"/>}
                {showText ? '隐藏原文' : '查看原文'}
            </button>
            <button
            onClick={handleGenerate}
            disabled={loading}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg font-medium shadow-lg transition-all"
            >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Clapperboard className="w-4 h-4" />}
            {hasShots ? '重新生成分镜' : '生成分镜列表'}
            </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden flex gap-4">
        
        {/* Optional Text Panel */}
        {showText && (
            <div className="w-1/3 bg-gray-900/50 border-r border-gray-800 h-full overflow-y-auto p-6 rounded-lg">
                <h3 className="text-sm font-bold text-gray-400 uppercase mb-4 sticky top-0 bg-gray-900/90 backdrop-blur pb-2">章节原文</h3>
                <div className="text-gray-300 text-sm leading-loose font-serif whitespace-pre-wrap">
                    {chapter.content}
                </div>
            </div>
        )}

        <div className={`flex-1 h-full overflow-hidden flex flex-col`}>
            {!hasShots && !loading && (
            <div className="h-full flex flex-col items-center justify-center text-gray-500">
                <Clapperboard className="w-16 h-16 text-gray-800 mb-4" />
                <p>准备就绪，点击生成按钮将本章拆解为镜头语言。</p>
            </div>
            )}

            {loading && (
                <div className="h-full flex flex-col items-center justify-center">
                    <div className="relative">
                        <div className="w-16 h-16 border-4 border-emerald-900 rounded-full"></div>
                        <div className="w-16 h-16 border-4 border-emerald-500 rounded-full animate-spin absolute top-0 border-t-transparent"></div>
                    </div>
                    <p className="mt-6 text-emerald-400 font-medium">AI 导演正在工作中...</p>
                    <p className="text-gray-500 text-sm mt-2">正在深度分析剧情，预计生成 40+ 个专业镜头。</p>
                </div>
            )}

            {hasShots && !loading && (
            <div className="h-full overflow-y-auto pr-2 pb-20">
                 <div className="flex justify-end mb-4">
                     <button 
                        onClick={() => {
                            setEditingShot({
                                id: ((chapter.storyboard?.length || 0) + 1).toString(),
                                speaker: '', script: '', visualPrompt: '', videoPrompt: '', shotType: '中景', angle: '平视', audio: '', sfx: ''
                            });
                            setIsNew(true);
                        }}
                        className="flex items-center gap-1 text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-1.5 rounded transition-colors"
                     >
                         <Plus className="w-3 h-3"/> 新增镜头
                     </button>
                 </div>

                <div className="space-y-6">
                    {(chapter.storyboard || []).map((shot, idx) => (
                        <div key={idx} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow group relative">
                            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 flex gap-1 transition-opacity z-10 bg-gray-950/80 p-1 rounded backdrop-blur">
                                <button onClick={() => setEditingShot(shot)} className="p-1.5 hover:bg-indigo-600 text-gray-400 hover:text-white rounded"><Edit2 className="w-3.5 h-3.5"/></button>
                                <button onClick={() => handleDeleteShot(shot.id)} className="p-1.5 hover:bg-red-600 text-gray-400 hover:text-white rounded"><Trash2 className="w-3.5 h-3.5"/></button>
                            </div>

                            <div className="bg-gray-800/50 px-4 py-2 border-b border-gray-800 flex justify-between items-center">
                                <span className="font-mono text-emerald-400 font-bold">镜头 {shot.id}</span>
                                <div className="flex gap-2">
                                    <span className="text-xs bg-gray-900 text-gray-400 px-2 py-1 rounded border border-gray-700 uppercase tracking-wider font-semibold">{shot.angle || '平视'}</span>
                                    <span className="text-xs bg-gray-900 text-gray-400 px-2 py-1 rounded border border-gray-700 uppercase tracking-wider font-semibold">{shot.shotType}</span>
                                </div>
                            </div>
                            
                            <div className="p-5 grid grid-cols-1 lg:grid-cols-12 gap-6">
                                
                                {/* Script Column */}
                                <div className="lg:col-span-4 border-r border-gray-800/50 pr-4">
                                    <h4 className="text-xs text-gray-500 uppercase font-bold mb-3 flex items-center gap-1.5"><Mic className="w-3 h-3"/> 剧本与台词</h4>
                                    
                                    <div className="space-y-3">
                                        <div className="bg-gray-950 p-3 rounded-lg border border-gray-800">
                                            <span className="text-xs text-indigo-400 font-bold block mb-1">{shot.speaker || "无 / 旁白"}</span>
                                            {/* Changed: Removed font-serif and italic to improve readability as requested */}
                                            <p className="text-gray-200 text-sm leading-relaxed">{shot.script}</p>
                                        </div>
                                        
                                        {(shot.audio || shot.sfx) && (
                                            <div className="text-xs space-y-2">
                                                {shot.audio && (
                                                    <p className="text-gray-400"><span className="text-gray-600 font-semibold">配音指导:</span> {shot.audio}</p>
                                                )}
                                                {shot.sfx && (
                                                    <p className="text-pink-400/80"><span className="text-pink-900/50 border border-pink-900/30 px-1 rounded mr-1">SFX</span> {shot.sfx}</p>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Visual Prompts Column */}
                                <div className="lg:col-span-8 space-y-4">
                                    <div>
                                        <div className="flex justify-between items-center mb-1">
                                            <h4 className="text-xs text-blue-400 uppercase font-bold flex items-center gap-1.5"><ImageIcon className="w-3 h-3"/> 图片提示词 (首帧)</h4>
                                            <button 
                                                onClick={() => copyToClipboard(shot.visualPrompt, `img-${idx}`)}
                                                className="text-xs text-gray-500 hover:text-white flex items-center gap-1 transition-colors"
                                            >
                                                {copiedId === `img-${idx}` ? <Check className="w-3 h-3 text-green-500"/> : <Copy className="w-3 h-3"/>}
                                                复制
                                            </button>
                                        </div>
                                        <div className="bg-gray-950 p-3 rounded-lg border border-gray-800 text-sm text-gray-300 font-mono leading-relaxed select-text">
                                            {shot.visualPrompt}
                                        </div>
                                    </div>

                                    <div>
                                        <div className="flex justify-between items-center mb-1">
                                            <h4 className="text-xs text-purple-400 uppercase font-bold flex items-center gap-1.5"><Video className="w-3 h-3"/> 视频提示词 (运镜与动态)</h4>
                                            <button 
                                                onClick={() => copyToClipboard(shot.videoPrompt, `vid-${idx}`)}
                                                className="text-xs text-gray-500 hover:text-white flex items-center gap-1 transition-colors"
                                            >
                                                {copiedId === `vid-${idx}` ? <Check className="w-3 h-3 text-green-500"/> : <Copy className="w-3 h-3"/>}
                                                复制
                                            </button>
                                        </div>
                                        <div className="bg-gray-950 p-3 rounded-lg border border-gray-800 text-sm text-gray-300 font-mono leading-relaxed select-text">
                                            {shot.videoPrompt}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
            )}
        </div>
      </div>

       {/* Edit Shot Modal */}
       {editingShot && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
              <div className="bg-gray-900 w-full max-w-2xl rounded-xl border border-gray-800 shadow-2xl flex flex-col max-h-[90vh]">
                  <div className="p-4 border-b border-gray-800 flex justify-between items-center bg-gray-950 rounded-t-xl">
                      <h3 className="text-lg font-bold text-white">{isNew ? '新增镜头' : '编辑镜头'}</h3>
                      <button onClick={() => { setEditingShot(null); setIsNew(false); }} className="text-gray-500 hover:text-white"><X className="w-5 h-5"/></button>
                  </div>
                  <div className="p-6 overflow-y-auto space-y-4">
                      <div className="grid grid-cols-4 gap-4">
                           <div className="col-span-1">
                                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">镜头号 (ID)</label>
                                <input type="text" value={editingShot.id} onChange={e => setEditingShot({...editingShot, id: e.target.value})} className="w-full bg-gray-950 border border-gray-800 rounded p-2 text-white focus:border-indigo-500 outline-none" />
                           </div>
                           <div className="col-span-3">
                                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">语音分镜 (Speaker)</label>
                                <input type="text" value={editingShot.speaker} onChange={e => setEditingShot({...editingShot, speaker: e.target.value})} className="w-full bg-gray-950 border border-gray-800 rounded p-2 text-white focus:border-indigo-500 outline-none" placeholder="角色名 / 旁白" />
                           </div>
                      </div>

                      {/* Camera Specs Row */}
                      <div className="grid grid-cols-2 gap-4">
                           <div>
                                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1 text-emerald-400">景别 (Shot Type)</label>
                                <div className="relative">
                                     <input 
                                        type="text" 
                                        list="shotTypeOptions"
                                        value={editingShot.shotType} 
                                        onChange={e => setEditingShot({...editingShot, shotType: e.target.value})} 
                                        className="w-full bg-gray-950 border border-emerald-900/50 rounded p-2 text-white focus:border-emerald-500 outline-none" 
                                        placeholder="如: 大特写, 中景"
                                     />
                                     <datalist id="shotTypeOptions">
                                         {SHOT_TYPE_OPTIONS.map(opt => <option key={opt} value={opt} />)}
                                     </datalist>
                                </div>
                           </div>
                           <div>
                                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1 text-emerald-400">视角 (Angle)</label>
                                <div className="relative">
                                    <input 
                                        type="text" 
                                        list="angleOptions"
                                        value={editingShot.angle} 
                                        onChange={e => setEditingShot({...editingShot, angle: e.target.value})} 
                                        className="w-full bg-gray-950 border border-emerald-900/50 rounded p-2 text-white focus:border-emerald-500 outline-none" 
                                        placeholder="如: 平视, 仰视"
                                    />
                                    <datalist id="angleOptions">
                                         {ANGLE_OPTIONS.map(opt => <option key={opt} value={opt} />)}
                                     </datalist>
                                </div>
                           </div>
                      </div>

                      <div>
                            <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">文案 (Script)</label>
                            <textarea value={editingShot.script} onChange={e => setEditingShot({...editingShot, script: e.target.value})} className="w-full bg-gray-950 border border-gray-800 rounded p-2 text-white h-20 focus:border-indigo-500 outline-none" />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                           <div>
                                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">配音指导 (Audio)</label>
                                <input type="text" value={editingShot.audio} onChange={e => setEditingShot({...editingShot, audio: e.target.value})} className="w-full bg-gray-950 border border-gray-800 rounded p-2 text-white focus:border-indigo-500 outline-none" />
                           </div>
                           <div>
                                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">音效 (SFX)</label>
                                <input type="text" value={editingShot.sfx} onChange={e => setEditingShot({...editingShot, sfx: e.target.value})} className="w-full bg-gray-950 border border-gray-800 rounded p-2 text-white focus:border-indigo-500 outline-none" />
                           </div>
                      </div>

                      <div>
                          <label className="block text-xs font-semibold text-gray-500 uppercase mb-1 text-blue-400">图片提示词 (Visual Prompt)</label>
                          <textarea value={editingShot.visualPrompt} onChange={e => setEditingShot({...editingShot, visualPrompt: e.target.value})} className="w-full bg-gray-950 border border-blue-900/30 rounded p-2 text-white h-24 focus:border-blue-500 outline-none" />
                      </div>
                      
                      <div>
                          <label className="block text-xs font-semibold text-gray-500 uppercase mb-1 text-purple-400">视频提示词 (Video Prompt)</label>
                          <textarea value={editingShot.videoPrompt} onChange={e => setEditingShot({...editingShot, videoPrompt: e.target.value})} className="w-full bg-gray-950 border border-purple-900/30 rounded p-2 text-white h-24 focus:border-purple-500 outline-none" />
                      </div>
                  </div>
                  <div className="p-4 border-t border-gray-800 flex justify-end gap-3 bg-gray-950 rounded-b-xl">
                      <button onClick={() => { setEditingShot(null); setIsNew(false); }} className="px-4 py-2 rounded text-gray-400 hover:bg-gray-800">取消</button>
                      <button onClick={() => saveShot(editingShot)} className="px-4 py-2 rounded bg-indigo-600 hover:bg-indigo-700 text-white flex items-center gap-2"><Save className="w-4 h-4"/> 保存</button>
                  </div>
              </div>
          </div>
       )}
    </div>
  );
};
