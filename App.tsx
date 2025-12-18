import React, { useState, useEffect, useRef } from 'react';
import { Project, AppView, PromptConfig } from './types';
import { Sidebar } from './components/Sidebar';
import { EntityExtraction } from './components/EntityExtraction';
import { ChapterManager } from './components/ChapterManager';
import { StoryboardView } from './components/StoryboardView';
import { SettingsView } from './components/SettingsView';
import { ExportManager } from './components/ExportManager';
import { fileSystem } from './services/fileSystemService';
import { analyzeEntitiesWithProgress, DEFAULT_PROMPTS } from './services/geminiService';
import { Upload, FileText, AlertTriangle, Settings, Download, Loader2, X } from 'lucide-react';

const App: React.FC = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [view, setView] = useState<AppView>(AppView.PROJECT_SELECT);
  const [selectedChapterId, setSelectedChapterId] = useState<string | null>(null);
  
  // Global Analysis State (Lifted from EntityExtraction)
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [analysisStatus, setAnalysisStatus] = useState("");
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  
  const abortControllerRef = useRef<AbortController | null>(null);
  
  // File System State
  const [dirHandle, setDirHandle] = useState<any>(null);

  // Load from local storage on mount
  useEffect(() => {
    const saved = localStorage.getItem('novelProjects');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const sanitized = sanitizeProjects(parsed);
        setProjects(sanitized);
      } catch (e) {
        console.error("Failed to load projects:", e);
      }
    }
  }, []);

  // Save to local storage on change
  useEffect(() => {
    localStorage.setItem('novelProjects', JSON.stringify(projects));
  }, [projects]);

  // Auto-save to Disk
  useEffect(() => {
      if (dirHandle && currentProjectId) {
          const project = projects.find(p => p.id === currentProjectId);
          if (project) {
              const timer = setTimeout(() => {
                  fileSystem.saveProjectToDirectory(dirHandle, project)
                    .catch(err => console.error("Auto-save failed", err));
              }, 2000); 
              return () => clearTimeout(timer);
          }
      }
  }, [projects, currentProjectId, dirHandle]);

  const sanitizeProjects = (parsed: any): Project[] => {
     return Array.isArray(parsed) ? parsed.map((p: any) => ({
          ...p,
          fullText: p.fullText || '',
          prompts: p.prompts || DEFAULT_PROMPTS,
          characters: Array.isArray(p.characters) ? p.characters.map((c: any) => ({
              ...c,
              aliases: Array.isArray(c.aliases) ? c.aliases : [],
              clothingStyles: Array.isArray(c.clothingStyles) ? c.clothingStyles : []
          })) : [],
          scenes: Array.isArray(p.scenes) ? p.scenes.map((s: any) => ({
              ...s,
              aliases: Array.isArray(s.aliases) ? s.aliases : []
          })) : [],
          chapters: Array.isArray(p.chapters) ? p.chapters.map((c: any) => ({
             ...c,
             content: c.content || '',
             storyboard: Array.isArray(c.storyboard) ? c.storyboard : []
          })) : []
        })) : [];
  }

  const handleOpenLocalFolder = async () => {
      const handle = await fileSystem.openDirectory();
      setDirHandle(handle);
      const diskProjects = await fileSystem.loadProjectsFromDirectory(handle);
      if (diskProjects.length > 0) {
          const sanitized = sanitizeProjects(diskProjects);
          const existingIds = new Set(projects.map(p => p.id));
          const newProjects = sanitized.filter(p => !existingIds.has(p.id));
          setProjects([...projects, ...newProjects]);
          alert(`成功加载目录，导入了 ${newProjects.length} 个新项目。`);
      } else {
          alert("目录连接成功。");
      }
  };

  const handleLegacyImport = async (files: FileList) => {
      const newProjects: Project[] = [];
      for (let i = 0; i < files.length; i++) {
          const file = files[i];
          if (file.name.endsWith('.json')) {
              try {
                  const text = await file.text();
                  const data = JSON.parse(text);
                  if (data.id && data.title) newProjects.push(data);
              } catch (e) { console.warn(`Failed to parse ${file.name}`); }
          }
      }
      if (newProjects.length > 0) {
          const sanitized = sanitizeProjects(newProjects);
          const existingIds = new Set(projects.map(p => p.id));
          const uniqueProjects = sanitized.filter(p => !existingIds.has(p.id));
          setProjects(prev => [...prev, ...uniqueProjects]);
          alert(`导入了 ${uniqueProjects.length} 个项目。`);
      }
  };

  const currentProject = projects.find(p => p.id === currentProjectId);

  const handleAddProject = () => {
    const newProject: Project = {
      id: crypto.randomUUID(),
      title: `新项目 ${projects.length + 1}`,
      createdAt: Date.now(),
      fullText: '',
      characters: [],
      scenes: [],
      chapters: [],
      prompts: DEFAULT_PROMPTS
    };
    setProjects([...projects, newProject]);
    setCurrentProjectId(newProject.id);
    setView(AppView.ANALYSIS);
  };

  const handleDeleteProject = (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      if(window.confirm("确定要删除这个项目吗？")) {
        setProjects(projects.filter(p => p.id !== id));
        if (currentProjectId === id) setCurrentProjectId(null);
      }
  }

  const handleUpdateProject = (updated: Project) => {
    setProjects(prev => prev.map(p => p.id === updated.id ? updated : p));
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!currentProject || !e.target.files?.[0]) return;
    const file = e.target.files[0];
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      handleUpdateProject({ ...currentProject, title: file.name.replace('.txt', ''), fullText: text });
    };
    reader.readAsText(file);
  };

  // --- Global Analysis Handler ---
  const handleStartAnalysis = async (fullText: string, config: PromptConfig) => {
      if (!currentProject) return;
      
      // Cancel previous if exists
      if (abortControllerRef.current) {
          abortControllerRef.current.abort();
      }

      const controller = new AbortController();
      abortControllerRef.current = controller;

      setIsAnalyzing(true);
      setAnalysisProgress(0);
      setAnalysisStatus("初始化分析引擎...");
      setAnalysisError(null);

      try {
          const result = await analyzeEntitiesWithProgress(
              fullText,
              config,
              (pct, status) => {
                  setAnalysisProgress(pct);
                  setAnalysisStatus(status);
              },
              controller.signal
          );
          
          setProjects(prev => {
              return prev.map(p => {
                  if (p.id === currentProjectId) {
                      return {
                          ...p,
                          characters: result.characters,
                          scenes: result.scenes,
                          debugLog: result.debugLog
                      };
                  }
                  return p;
              });
          });
      } catch (e: any) {
          if (e.message === 'Analysis cancelled' || e.name === 'AbortError') {
              setAnalysisStatus("已取消");
              setAnalysisError(null);
          } else {
              console.error(e);
              setAnalysisError(e.message || "分析失败");
          }
      } finally {
          if (abortControllerRef.current === controller) {
              setIsAnalyzing(false);
              setAnalysisProgress(0);
              setAnalysisStatus("");
              abortControllerRef.current = null;
          }
      }
  };

  const handleCancelAnalysis = () => {
      if (abortControllerRef.current) {
          abortControllerRef.current.abort();
          setAnalysisStatus("正在取消...");
      }
  };


  const renderContent = () => {
    if (!currentProject) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center bg-gray-950 text-gray-500">
           <FileText className="w-16 h-16 opacity-20 mb-4" />
           <p>请选择或创建一个项目。</p>
        </div>
      );
    }

    if (!currentProject.fullText) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center bg-gray-950 p-10">
           <div className="max-w-xl w-full bg-gray-900 border border-gray-800 rounded-2xl p-10 text-center shadow-2xl">
              <Upload className="w-16 h-16 text-indigo-500 mx-auto mb-6" />
              <h2 className="text-2xl font-bold text-white mb-2">上传小说文件</h2>
              <p className="text-gray-400 mb-8">支持格式：.txt</p>
              <label className="inline-flex cursor-pointer bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-3 px-8 rounded-lg transition-all shadow-lg">
                 <span>选择文件</span>
                 <input type="file" accept=".txt" className="hidden" onChange={handleFileUpload} />
              </label>
           </div>
        </div>
      );
    }

    switch (view) {
      case AppView.STORYBOARD:
        if (selectedChapterId) {
            return <StoryboardView project={currentProject} chapterId={selectedChapterId} onBack={() => setView(AppView.CHAPTERS)} onUpdateProject={handleUpdateProject} />;
        }
        return null;
      case AppView.EXPORT:
        return (
            <div className="flex-1 overflow-hidden bg-gray-950">
                <div className="border-b border-gray-800 px-6 py-4 flex items-center justify-between bg-gray-950 z-10">
                   <h2 className="text-xl font-bold text-white">导出中心</h2>
                   <button onClick={() => setView(AppView.ANALYSIS)} className="text-gray-400 hover:text-white">关闭</button>
                </div>
                <ExportManager project={currentProject} />
            </div>
        );
      case AppView.SETTINGS:
       return (
         <div className="flex-1 overflow-hidden bg-gray-950">
             <div className="border-b border-gray-800 px-6 py-4 flex items-center justify-between bg-gray-950 z-10">
                <h2 className="text-xl font-bold text-white">项目设置</h2>
                <button onClick={() => setView(AppView.ANALYSIS)} className="text-gray-400 hover:text-white">关闭</button>
             </div>
             <SettingsView project={currentProject} onUpdateProject={handleUpdateProject} />
         </div>
       );
      
      case AppView.ANALYSIS:
      case AppView.CHAPTERS:
      default:
        return (
          <div className="flex-1 flex flex-col bg-gray-950 h-screen overflow-hidden">
            <div className="border-b border-gray-800 px-6 py-4 flex items-center justify-between bg-gray-950 z-10">
              <div>
                  <h2 className="text-xl font-bold text-white tracking-tight">{currentProject.title}</h2>
                  <p className="text-xs text-gray-500 mt-0.5 font-mono">{(currentProject.fullText?.length || 0).toLocaleString()} 字 &bull; {currentProject.prompts?.modelName}</p>
              </div>
              <div className="flex bg-gray-900 p-1 rounded-lg border border-gray-800">
                  <button onClick={() => setView(AppView.ANALYSIS)} className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${view === AppView.ANALYSIS ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-400 hover:text-gray-200'}`}>1. 设定提取</button>
                  <button onClick={() => setView(AppView.CHAPTERS)} className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${view === AppView.CHAPTERS ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-400 hover:text-gray-200'}`}>2. 章节 & 分镜</button>
              </div>
              <div className="flex items-center gap-1">
                  <button onClick={() => setView(AppView.EXPORT)} className="p-2 rounded-lg transition-colors text-gray-400 hover:text-white hover:bg-gray-800" title="导出数据"><Download className="w-5 h-5" /></button>
                  <button onClick={() => setView(AppView.SETTINGS)} className="p-2 rounded-lg transition-colors text-gray-400 hover:text-white hover:bg-gray-800" title="Prompt 设置"><Settings className="w-5 h-5" /></button>
              </div>
            </div>

            <div className="flex-1 overflow-hidden p-6 relative">
              {view === AppView.ANALYSIS && (
                <EntityExtraction 
                    project={currentProject} 
                    onUpdateProject={handleUpdateProject}
                    loading={isAnalyzing}
                    progress={analysisProgress}
                    statusText={analysisStatus}
                    onStartAnalysis={handleStartAnalysis}
                    onCancelAnalysis={handleCancelAnalysis}
                    error={analysisError}
                />
              )}
              {view === AppView.CHAPTERS && (
                <ChapterManager 
                    project={currentProject} 
                    onUpdateProject={handleUpdateProject} 
                    onSelectChapter={(id) => { setSelectedChapterId(id); setView(AppView.STORYBOARD); }}
                />
              )}
            </div>
          </div>
        );
    }
  };

  return (
    <div className="flex h-screen w-screen bg-gray-950 text-gray-100 overflow-hidden font-sans">
      <Sidebar 
        projects={projects}
        currentProjectId={currentProjectId}
        onSelectProject={(id) => { setCurrentProjectId(id); setView(AppView.ANALYSIS); }}
        onAddProject={handleAddProject}
        onDeleteProject={handleDeleteProject}
        onOpenLocalFolder={handleOpenLocalFolder}
        onLegacyImport={handleLegacyImport}
        isLocalConnected={!!dirHandle}
      />
      <main className="flex-1 flex flex-col relative">
        {!process.env.API_KEY && (
            <div className="absolute top-0 left-0 w-full bg-red-600/20 border-b border-red-500/50 text-red-200 px-4 py-2 text-center text-sm z-50 flex items-center justify-center gap-2">
                <AlertTriangle className="w-4 h-4" /> 检测到缺少 API Key，功能可能无法正常使用。
            </div>
        )}
        
        {renderContent()}

        {/* Global Persistent Progress Indicator (Visible when analyzing but NOT in Analysis View) */}
        {isAnalyzing && view !== AppView.ANALYSIS && (
            <div className="absolute bottom-6 right-6 z-50 bg-gray-900 border border-gray-800 rounded-lg p-4 shadow-2xl w-80 animate-slide-up">
                <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-bold text-white flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin text-indigo-500"/> 后台分析中...
                    </span>
                    <div className="flex items-center gap-2">
                         <span className="text-xs text-indigo-400">{analysisProgress}%</span>
                         <button onClick={handleCancelAnalysis} className="text-gray-500 hover:text-white">
                             <X className="w-3.5 h-3.5" />
                         </button>
                    </div>
                </div>
                <div className="w-full bg-gray-800 rounded-full h-1.5 overflow-hidden mb-2">
                   <div className="bg-indigo-500 h-full transition-all duration-300" style={{width: `${analysisProgress}%`}}></div>
                </div>
                <p className="text-[10px] text-gray-500 truncate">{analysisStatus}</p>
            </div>
        )}
      </main>
    </div>
  );
};

export default App;