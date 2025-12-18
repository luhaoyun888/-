import React, { useState } from 'react';
import { Project, Chapter, Shot } from '../types';
// Import DEFAULT_PROMPTS to use as a fallback for the prompt configuration
import { splitChaptersRegex, normalizeTextEntities, generateStoryboard, DEFAULT_PROMPTS } from '../services/geminiService';
import { Book, FileText, LayoutList, PlayCircle, Loader2, Sparkles, X, CheckCircle2, Clock, Edit2, Trash2, Plus, Save } from 'lucide-react';

interface ChapterManagerProps {
  project: Project;
  onUpdateProject: (p: Project) => void;
  onSelectChapter: (chapterId: string) => void;
}

export const ChapterManager: React.FC<ChapterManagerProps> = ({ project, onUpdateProject, onSelectChapter }) => {
  const [loading, setLoading] = useState(false);
  
  // Batch Generation State
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [batchStart, setBatchStart] = useState(1);
  const [batchEnd, setBatchEnd] = useState(1);
  const [batchProcessing, setBatchProcessing] = useState(false);
  const [batchProgress, setBatchProgress] = useState<string>("");

  // Edit Chapter State
  const [editingChapter, setEditingChapter] = useState<Chapter | null>(null);
  const [isNewChapter, setIsNewChapter] = useState(false);

  const handleSplit = () => {
    if (!project.fullText) return;
    setLoading(true);
    try {
      const chapterMetas = splitChaptersRegex(project.fullText);
      let lastIndex = 0;
      const fullChapters: Chapter[] = [];

      for (let i = 0; i < chapterMetas.length; i++) {
        const meta = chapterMetas[i];
        const startIdx = project.fullText.indexOf(meta.startLine, lastIndex);
        if (startIdx === -1) continue;

        let endIdx = project.fullText.length;
        if (i < chapterMetas.length - 1 && chapterMetas[i+1].title) {
             const nextTitleStart = project.fullText.indexOf(chapterMetas[i+1].title, startIdx + 10);
             if (nextTitleStart !== -1) endIdx = nextTitleStart;
        }

        let content = project.fullText.substring(startIdx, endIdx).trim();
        lastIndex = endIdx;

        // AUTOMATIC NORMALIZATION: Apply entity mapping immediately during split
        content = normalizeTextEntities(content, project.characters || [], project.scenes || []);

        fullChapters.push({
            id: crypto.randomUUID(),
            title: meta.title || `Chapter ${i+1}`,
            summary: meta.summary || '',
            content: content,
            storyboard: []
        });
      }

      onUpdateProject({ ...project, chapters: fullChapters });
      setBatchEnd(fullChapters.length);
    } catch (e) {
      alert("拆分失败: " + e);
    } finally {
      setLoading(false);
    }
  };

  const handleBatchGenerate = async () => {
      setBatchProcessing(true);
      const chaptersToProcess = (project.chapters || []).slice(batchStart - 1, batchEnd);
      let updatedChapters = [...(project.chapters || [])];
      
      try {
          for (let i = 0; i < chaptersToProcess.length; i++) {
              const chapter = chaptersToProcess[i];
              const actualIndex = batchStart - 1 + i;
              setBatchProgress(`正在处理第 ${actualIndex + 1} 章 (${i + 1}/${chaptersToProcess.length}): ${chapter.title}`);
              
              // Pass the full PromptConfig object to generateStoryboard instead of just the prompt string
              const shots = await generateStoryboard(
                  chapter.content, 
                  { characters: project.characters || [], scenes: project.scenes || [] },
                  project.prompts || DEFAULT_PROMPTS
              );
              updatedChapters[actualIndex] = { ...chapter, storyboard: shots };
          }
          onUpdateProject({ ...project, chapters: updatedChapters });
          setBatchProgress("批量生成完成！");
          setTimeout(() => {
              setBatchProcessing(false);
              setShowBatchModal(false);
          }, 1500);
      } catch (e) {
          setBatchProgress("生成过程中断: " + e);
          setBatchProcessing(false);
      }
  };

  const handleDeleteChapter = (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      if (!window.confirm("确定删除此章节吗？")) return;
      onUpdateProject({ ...project, chapters: (project.chapters || []).filter(c => c.id !== id) });
  };

  const handleSaveChapter = (chapter: Chapter) => {
      if (!chapter.title.trim()) return;
      let updatedChapters = [...(project.chapters || [])];
      
      // Ensure edited content is also normalized
      const normalizedContent = normalizeTextEntities(chapter.content, project.characters || [], project.scenes || []);
      const sanitizedChapter = { ...chapter, content: normalizedContent };

      if (isNewChapter) updatedChapters.push(sanitizedChapter);
      else updatedChapters = updatedChapters.map(c => c.id === sanitizedChapter.id ? sanitizedChapter : c);
      onUpdateProject({ ...project, chapters: updatedChapters });
      setEditingChapter(null);
      setIsNewChapter(false);
  };

  const hasChapters = (project.chapters || []).length > 0;

  if (!project.fullText) return <div className="p-10 text-center text-gray-500">请先上传小说文件。</div>;

  return (
    <div className="h-full flex flex-col relative">
       <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-white mb-1">章节管理 (Chapters)</h2>
          <p className="text-gray-400 text-sm">通过正则表达式快速拆分章节，并自动建立角色与场景映射。</p>
        </div>
        <div className="flex gap-3">
             <button
                onClick={() => {
                    setEditingChapter({ id: crypto.randomUUID(), title: `第 ${(project.chapters || []).length + 1} 章`, summary: '', content: '', storyboard: [] });
                    setIsNewChapter(true);
                }}
                className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 text-gray-200 px-4 py-2.5 rounded-lg font-medium transition-all"
             >
                 <Plus className="w-4 h-4" /> 新增章节
             </button>
             {hasChapters && (
                 <button
                    onClick={() => { setBatchStart(1); setBatchEnd((project.chapters || []).length); setShowBatchModal(true); }}
                    className="flex items-center gap-2 bg-emerald-700/50 hover:bg-emerald-700 text-emerald-100 px-4 py-2.5 rounded-lg font-medium transition-all"
                >
                    <Sparkles className="w-4 h-4" /> 批量生成分镜
                </button>
             )}
            <button
            onClick={handleSplit}
            disabled={loading}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-5 py-2.5 rounded-lg font-medium transition-all shadow-lg"
            >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <LayoutList className="w-4 h-4" />}
            {hasChapters ? '重新拆分章节' : '正则拆分章节'}
            </button>
        </div>
      </div>

      {!hasChapters && !loading && (
        <div className="flex-1 flex flex-col items-center justify-center bg-gray-900/30 rounded-xl border border-gray-800">
           < Book className="w-12 h-12 text-gray-700 mb-4" />
           <p className="text-gray-500">点击右上角“正则拆分章节”快速匹配目录结构。</p>
        </div>
      )}

      {loading && (
         <div className="flex-1 flex flex-col items-center justify-center bg-gray-900/30 rounded-xl border border-gray-800">
             <Loader2 className="w-10 h-10 text-indigo-500 animate-spin mb-4" />
             <p className="text-gray-400">正在正则匹配目录并建立实体映射...</p>
         </div>
      )}

      {hasChapters && !loading && (
        <div className="flex-1 overflow-y-auto pr-2 space-y-3 pb-10">
            {(project.chapters || []).map((chapter, idx) => (
                <div key={chapter.id} className="group bg-gray-900 border border-gray-800 hover:border-indigo-500/50 p-5 rounded-xl transition-all relative">
                    <div className="absolute top-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                         <button onClick={(e) => { e.stopPropagation(); setEditingChapter(chapter); setIsNewChapter(false); }} className="p-1.5 hover:bg-gray-700 text-gray-400 hover:text-white rounded"><Edit2 className="w-4 h-4"/></button>
                         <button onClick={(e) => handleDeleteChapter(chapter.id, e)} className="p-1.5 hover:bg-red-900/50 text-gray-400 hover:text-red-400 rounded"><Trash2 className="w-4 h-4"/></button>
                    </div>

                    <div className="flex justify-between items-start mb-3">
                        <div className="flex items-center gap-3">
                            <span className="text-xs font-mono text-gray-500 bg-gray-950 px-2 py-1 rounded">第 {idx + 1} 章</span>
                            <h3 className="text-lg font-bold text-gray-100">{chapter.title}</h3>
                            {(chapter.storyboard?.length || 0) > 0 ? (
                                <span className="flex items-center gap-1.5 bg-emerald-900/30 text-emerald-400 px-2.5 py-1 rounded-full text-xs font-medium border border-emerald-900/50"><CheckCircle2 className="w-3.5 h-3.5"/> 已生成</span>
                            ) : (
                                <span className="flex items-center gap-1.5 bg-gray-800 text-gray-400 px-2.5 py-1 rounded-full text-xs font-medium border border-gray-700"><Clock className="w-3.5 h-3.5"/> 待生成</span>
                            )}
                        </div>
                        <div className="mr-20">
                            <button onClick={() => onSelectChapter(chapter.id)} className="flex items-center gap-1.5 text-xs bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-full transition-colors font-medium"><PlayCircle className="w-3.5 h-3.5" /> 处理分镜</button>
                        </div>
                    </div>
                    <div className="bg-gray-950/50 p-3 rounded text-xs text-gray-500 font-mono border border-gray-800/50 line-clamp-2">
                        {chapter.content ? chapter.content.slice(0, 150) : "无内容"}
                    </div>
                </div>
            ))}
        </div>
      )}

      {showBatchModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
               <div className="bg-gray-900 w-full max-md rounded-xl border border-gray-800 shadow-2xl p-6">
                   <div className="flex justify-between items-center mb-6">
                       <h3 className="text-lg font-bold text-white flex items-center gap-2"><Sparkles className="w-5 h-5 text-emerald-400"/> 批量生成分镜</h3>
                       {!batchProcessing && <button onClick={() => setShowBatchModal(false)} className="text-gray-500 hover:text-white"><X className="w-5 h-5"/></button>}
                   </div>
                   {batchProcessing ? (
                       <div className="text-center py-8">
                           <Loader2 className="w-10 h-10 text-emerald-500 animate-spin mx-auto mb-4"/>
                           <p className="text-emerald-400 font-medium">{batchProgress}</p>
                       </div>
                   ) : (
                       <>
                           <div className="space-y-4 mb-6">
                               <div>
                                   <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">起始</label>
                                   <input type="number" value={batchStart} onChange={(e) => setBatchStart(parseInt(e.target.value))} className="w-full bg-gray-950 border border-gray-800 rounded p-2 text-white" />
                               </div>
                               <div>
                                   <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">结束</label>
                                   <input type="number" value={batchEnd} onChange={(e) => setBatchEnd(parseInt(e.target.value))} className="w-full bg-gray-950 border border-gray-800 rounded p-2 text-white" />
                               </div>
                           </div>
                           <button onClick={handleBatchGenerate} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-3 rounded-lg font-bold">开始生成</button>
                       </>
                   )}
               </div>
          </div>
      )}

      {editingChapter && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
              <div className="bg-gray-900 w-full max-w-4xl rounded-xl border border-gray-800 shadow-2xl flex flex-col max-h-[90vh]">
                  <div className="p-4 border-b border-gray-800 flex justify-between items-center bg-gray-950 rounded-t-xl">
                      <h3 className="text-lg font-bold text-white">{isNewChapter ? '新增章节' : '编辑章节'}</h3>
                      <button onClick={() => { setEditingChapter(null); setIsNewChapter(false); }} className="text-gray-500 hover:text-white"><X className="w-5 h-5"/></button>
                  </div>
                  <div className="p-6 overflow-y-auto space-y-4">
                      <input type="text" value={editingChapter.title} onChange={(e) => setEditingChapter({...editingChapter, title: e.target.value})} className="w-full bg-gray-950 border border-gray-800 rounded p-2 text-white font-bold" placeholder="章节标题" />
                      <textarea value={editingChapter.content} onChange={(e) => setEditingChapter({...editingChapter, content: e.target.value})} className="w-full h-96 bg-gray-950 border border-gray-800 rounded p-4 text-gray-300 font-serif resize-none" placeholder="正文内容..." />
                  </div>
                  <div className="p-4 border-t border-gray-800 flex justify-end gap-3 bg-gray-950 rounded-b-xl">
                      <button onClick={() => { setEditingChapter(null); setIsNewChapter(false); }} className="px-4 py-2 rounded text-gray-400 hover:bg-gray-800">取消</button>
                      <button onClick={() => handleSaveChapter(editingChapter)} className="px-4 py-2 rounded bg-indigo-600 hover:bg-indigo-700 text-white flex items-center gap-2"><Save className="w-4 h-4"/> 保存</button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};
