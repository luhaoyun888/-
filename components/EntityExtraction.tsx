import React, { useState, useMemo } from 'react';
import { Project, Character, Scene, VISUAL_AGE_OPTIONS, Weapon, CHARACTER_ROLES, CharacterRole } from '../types';
import { analyzeEntitiesWithProgress, enrichEntities } from '../services/geminiService';
import { User, MapPin, Sparkles, Shirt, Loader2, AlertCircle, Edit2, Trash2, Plus, Save, X, Link as LinkIcon, Layers, LayoutGrid, LayoutTemplate, Copy, Sword, Activity, RefreshCw, ChevronDown, ChevronRight, Star, Bug, FileJson, CheckCircle2, Wrench, Wand2 } from 'lucide-react';

interface EntityExtractionProps {
  project: Project;
  onUpdateProject: (p: Project) => void;
  // Lifted state props
  loading: boolean;
  progress: number;
  statusText: string;
  onStartAnalysis: (fullText: string, prompt: string | undefined, delay: number | undefined) => Promise<void>;
  onCancelAnalysis: () => void;
  error: string | null;
}

const getTempId = () => Math.random().toString(36).substring(7);

export const EntityExtraction: React.FC<EntityExtractionProps> = ({ 
    project, 
    onUpdateProject, 
    loading, 
    progress, 
    statusText, 
    onStartAnalysis,
    onCancelAnalysis,
    error 
}) => {
  const [activeTab, setActiveTab] = useState<'chars' | 'scenes'>('chars');
  const [viewMode, setViewMode] = useState<'grid' | 'masonry'>('masonry');
  
  // Collapsed State for Sections
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});

  const toggleSection = (section: string) => {
      setCollapsedSections(prev => ({...prev, [section]: !prev[section]}));
  };

  // Edit State
  const [editingChar, setEditingChar] = useState<Character | null>(null);
  const [editingScene, setEditingScene] = useState<Scene | null>(null);
  const [editingGroupName, setEditingGroupName] = useState<{original: string, new: string} | null>(null);
  const [isNew, setIsNew] = useState(false);

  // Local state to prevent double-clicks
  const [isStarting, setIsStarting] = useState(false);
  const [isEnriching, setIsEnriching] = useState(false);

  const hasCustomPrompt = useMemo(() => {
      return !!project.prompts?.entityExtraction && project.prompts.entityExtraction.trim().length > 0;
  }, [project.prompts]);

  // --- Grouping Logic by Category ---

  // Helper to get all groups regardless of role
  const allCharGroups = useMemo(() => {
    const groups: Record<string, Character[]> = {};
      (project.characters || []).forEach(c => {
          const key = c.groupName || "未分组"; 
          if (!groups[key]) groups[key] = [];
          groups[key].push(c);
      });
      return groups;
  }, [project.characters]);

  const allSceneGroups = useMemo(() => {
    const groups: Record<string, Scene[]> = {};
    (project.scenes || []).forEach(s => {
        const key = s.groupName || "未分组";
        if (!groups[key]) groups[key] = [];
        groups[key].push(s);
    });
    return groups;
  }, [project.scenes]);


  // Helper to classify groups into categories
  const characterCategories = useMemo(() => {
      const categories: Record<CharacterRole, Record<string, Character[]>> = {
          '主要角色': {},
          '次要角色': {},
          '配角': {},
          '路人甲': {}
      };

      Object.entries(allCharGroups).forEach(([groupName, chars]) => {
          // Determine the dominant role for the group (default to Minor if mixed or undefined)
          // We look at the first character's role as the group determinant for simplicity
          const mainRole = chars[0]?.role || '配角'; 
          if (categories[mainRole]) {
              categories[mainRole][groupName] = chars;
          } else {
              categories['配角'][groupName] = chars; // Fallback
          }
      });
      return categories;
  }, [allCharGroups]);

  const sceneCategories = useMemo(() => {
      const categories: Record<string, Record<string, Scene[]>> = {
          '主要场景': {},
          '次要场景': {},
          '过场': {}
      };

      Object.entries(allSceneGroups).forEach(([groupName, scenes]) => {
          // Map internal types to display categories
          const type = scenes[0]?.type || '剧情节点';
          let catKey = '次要场景';
          if (type === '核心据点') catKey = '主要场景';
          else if (type === '剧情节点') catKey = '次要场景';
          else if (type === '过场') catKey = '过场';

          categories[catKey][groupName] = scenes;
      });
      return categories;
  }, [allSceneGroups]);

  // --- Validation ---
  const isGroupNameUnique = (name: string, type: 'char' | 'scene', skipOriginal: string | null = null) => {
      if (name === skipOriginal) return true;
      if (type === 'char') return !Object.keys(allCharGroups).includes(name);
      return !Object.keys(allSceneGroups).includes(name);
  };

  const isItemNameUnique = (name: string, type: 'char' | 'scene', id: string) => {
      if (type === 'char') {
          return !project.characters.some(c => c.name === name && c.id !== id);
      }
      return !project.scenes.some(s => s.name === name && s.id !== id);
  }

  // --- Actions ---

  const handleAnalyzeClick = async () => {
    if (!project.fullText) return;
    const confirmMsg = hasCustomPrompt 
        ? "即将使用【自定义提示词】重新分析全文。这将覆盖现有数据，是否继续？"
        : "重新分析将覆盖现有数据，是否继续？";
        
    if ((project.characters || []).length > 0 && !window.confirm(confirmMsg)) return;
    
    setIsStarting(true);
    try {
        await onStartAnalysis(
            project.fullText, 
            project.prompts?.entityExtraction,
            project.prompts?.apiDelay
        );
    } finally {
        setIsStarting(false);
    }
  };

  const handleEnrichClick = async () => {
      if ((project.characters || []).length === 0 && (project.scenes || []).length === 0) return;
      
      setIsEnriching(true);
      try {
          const result = await enrichEntities(
              { characters: project.characters || [], scenes: project.scenes || [] },
              project.prompts?.entityEnrichment
          );
          onUpdateProject({
              ...project,
              characters: result.characters,
              scenes: result.scenes
          });
          alert("智能补全完成！");
      } catch (e: any) {
          alert("补全失败: " + e.message);
      } finally {
          setIsEnriching(false);
      }
  };

  const downloadDebugData = () => {
      if (!project.debugLog) {
          alert("暂无调试日志。请重新运行一次分析以收集数据。");
          return;
      }
      const data = {
          logs: project.debugLog,
          currentEntities: {
              characters: project.characters,
              scenes: project.scenes
          }
      };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `debug_logs_${project.title}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
  };

  const deleteGroup = (groupName: string, type: 'char' | 'scene') => {
      if (!window.confirm(`确定删除整个 "${groupName}" 分组及其包含的所有项吗？`)) return;
      
      if (type === 'char') {
          const updated = (project.characters || []).filter(c => (c.groupName || "未分组") !== groupName);
          onUpdateProject({ ...project, characters: updated });
      } else {
          const updated = (project.scenes || []).filter(s => (s.groupName || "未分组") !== groupName);
          onUpdateProject({ ...project, scenes: updated });
      }
  };

  const renameGroup = () => {
      if (!editingGroupName) return;
      const { original, new: newName } = editingGroupName;
      const type = activeTab === 'chars' ? 'char' : 'scene';

      if (!newName.trim() || original === newName) {
          setEditingGroupName(null);
          return;
      }

      if (!isGroupNameUnique(newName, type, original)) {
          alert(`分组名称 "${newName}" 已存在，请使用其他名称。`);
          return;
      }

      if (activeTab === 'chars') {
          const updatedChars = (project.characters || []).map(c => 
              c.groupName === original ? { ...c, groupName: newName } : c
          );
          onUpdateProject({ ...project, characters: updatedChars });
      } else {
          const updatedScenes = (project.scenes || []).map(s => 
              s.groupName === original ? { ...s, groupName: newName } : s
          );
          onUpdateProject({ ...project, scenes: updatedScenes });
      }
      setEditingGroupName(null);
  };

  const handleDeleteItem = (id: string, type: 'char' | 'scene', e: React.MouseEvent) => {
      e.stopPropagation();
      if (!window.confirm("确定删除此项吗？")) return;
      
      if (type === 'char') {
          const updated = (project.characters || []).filter(c => c.id !== id);
          onUpdateProject({ ...project, characters: updated });
      } else {
          const updated = (project.scenes || []).filter(s => s.id !== id);
          onUpdateProject({ ...project, scenes: updated });
      }
  }

  const handleEditItem = (item: Character | Scene, type: 'char' | 'scene', e: React.MouseEvent) => {
      e.stopPropagation();
      if (type === 'char') {
          setEditingChar(item as Character);
      } else {
          setEditingScene(item as Scene);
      }
  }

  const saveCharacter = (char: Character) => {
      if (!isItemNameUnique(char.name, 'char', char.id)) {
          alert(`角色名称 "${char.name}" 已存在，同个角色不同形态请保证名称唯一 (如: 孙悟空-行者形态)。`);
          return;
      }
      let updatedChars = [...(project.characters || [])];
      if (isNew) { updatedChars.push(char); } 
      else { updatedChars = updatedChars.map(c => c.id === char.id ? char : c); }
      onUpdateProject({ ...project, characters: updatedChars });
      setEditingChar(null);
      setIsNew(false);
  };

  const saveScene = (scene: Scene) => {
       if (!isItemNameUnique(scene.name, 'scene', scene.id)) {
          alert(`场景名称 "${scene.name}" 已存在。`);
          return;
      }
      let updatedScenes = [...(project.scenes || [])];
      if (isNew) { updatedScenes.push(scene); } 
      else { updatedScenes = updatedScenes.map(s => s.id === scene.id ? scene : s); }
      onUpdateProject({ ...project, scenes: updatedScenes });
      setEditingScene(null);
      setIsNew(false);
  };

  const getEmptyChar = (group: string, role: CharacterRole = '配角'): Character => ({
    id: getTempId(),
    groupName: group,
    name: `${group}-新形态`,
    role: role,
    aliases: [],
    age: VISUAL_AGE_OPTIONS[2],
    description: '',
    visualMemoryPoints: '',
    clothingStyles: [],
    weapons: []
  });

  const getEmptyScene = (group: string, type: any = '剧情节点'): Scene => ({
      id: getTempId(),
      groupName: group,
      name: `${group}-新区域`,
      aliases: [],
      description: '',
      structure: '外景',
      atmosphere: '',
      style: '',
      frequency: 1,
      type: type
  });

  const hasData = (project.characters?.length || 0) > 0 || (project.scenes?.length || 0) > 0;

  if (!project.fullText) return null;

  // Render Helpers
  const renderGroupContent = (groupName: string, items: any[]) => (
    <div key={groupName} className={`bg-gray-900/40 border border-gray-800 rounded-xl p-4 break-inside-avoid mb-6 ${viewMode === 'masonry' ? '' : 'h-full'}`}>
        <div className="flex items-center justify-between mb-4 pb-2 border-b border-gray-800/50">
             <div className="flex items-center gap-2">
                 <div className={`p-1.5 rounded ${activeTab === 'chars' ? 'bg-indigo-900/30 text-indigo-400' : 'bg-emerald-900/30 text-emerald-400'}`}>
                    {activeTab === 'chars' ? <User className="w-4 h-4"/> : <MapPin className="w-4 h-4"/>}
                 </div>
                 {editingGroupName?.original === groupName ? (
                     <div className="flex items-center gap-1">
                         <input 
                            autoFocus
                            className="bg-gray-950 border border-gray-700 text-sm text-white px-2 py-1 rounded outline-none"
                            value={editingGroupName.new}
                            onChange={(e) => setEditingGroupName({...editingGroupName, new: e.target.value})}
                            onKeyDown={(e) => e.key === 'Enter' && renameGroup()}
                         />
                         <button onClick={renameGroup} className="p-1 hover:bg-green-900/50 text-green-400 rounded"><Save className="w-3 h-3"/></button>
                     </div>
                 ) : (
                     <h3 className="font-bold text-gray-200 text-lg">{groupName}</h3>
                 )}
                 <span className="text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded-full">{items.length}</span>
             </div>
             <div className="flex items-center gap-1 opacity-100 transition-opacity">
                 <button onClick={() => { activeTab === 'chars' ? setEditingChar(getEmptyChar(groupName, items[0]?.role)) : setEditingScene(getEmptyScene(groupName, items[0]?.type)); setIsNew(true); }} className="p-1.5 hover:bg-gray-800 text-gray-400 hover:text-white rounded"><Plus className="w-4 h-4" /></button>
                 <button onClick={() => setEditingGroupName({ original: groupName, new: groupName })} className="p-1.5 hover:bg-gray-800 text-gray-400 hover:text-white rounded"><Edit2 className="w-3.5 h-3.5" /></button>
                 <button onClick={() => deleteGroup(groupName, activeTab === 'chars' ? 'char' : 'scene')} className="p-1.5 hover:bg-gray-800 text-gray-400 hover:text-red-400 rounded"><Trash2 className="w-3.5 h-3.5" /></button>
             </div>
        </div>
        
        <div className="flex flex-col gap-3">
            {items.map(item => (
                <div key={item.id} className="bg-gray-950 border border-gray-800/80 rounded-lg p-3 hover:border-indigo-500/30 transition-all group relative">
                    <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 flex gap-1 transition-opacity z-10 bg-gray-950/80 p-1 rounded-lg backdrop-blur-sm">
                        <button onClick={(e) => handleEditItem(item, activeTab === 'chars' ? 'char' : 'scene', e)} className="p-1.5 hover:bg-indigo-600 text-gray-400 hover:text-white rounded"><Edit2 className="w-3.5 h-3.5" /></button>
                        <button onClick={(e) => handleDeleteItem(item.id, activeTab === 'chars' ? 'char' : 'scene', e)} className="p-1.5 hover:bg-red-600 text-gray-400 hover:text-white rounded"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>

                    {activeTab === 'chars' ? (
                        <>
                            <div className="pr-8 mb-2">
                                <h4 className="font-bold text-indigo-200 text-sm flex items-center gap-2">{item.name}</h4>
                                <div className="flex flex-wrap gap-1 mt-1.5">
                                    <span className="text-[10px] bg-indigo-900/20 text-indigo-300 border border-indigo-900/30 px-1.5 rounded">{item.age.split(' ')[0]}</span>
                                    {(item.aliases || []).map((a: string, i: number) => <span key={i} className="text-[10px] bg-gray-800 text-gray-400 border border-gray-700 px-1.5 rounded">{a}</span>)}
                                </div>
                            </div>
                            <div className="text-xs text-gray-400">
                                <span className="text-gray-600 font-semibold mr-1">外貌:</span>
                                <span className="text-gray-300 leading-relaxed line-clamp-3">{item.visualMemoryPoints || "未提取"}</span>
                            </div>
                        </>
                    ) : (
                        <>
                             <div className="mb-2 pr-8">
                                <h4 className="font-bold text-emerald-200 text-sm flex items-center gap-2">
                                    {item.name}
                                    {item.type === '核心据点' && <Activity className="w-3 h-3 text-yellow-400" />}
                                </h4>
                                <div className="flex flex-wrap gap-1 mt-1.5">
                                    <span className={`text-[10px] px-1.5 rounded border ${item.structure === '内景' ? 'bg-orange-900/20 text-orange-400 border-orange-900/30' : 'bg-blue-900/20 text-blue-400 border-blue-900/30'}`}>{item.structure}</span>
                                    <span className="text-[10px] bg-gray-800 text-gray-400 px-1.5 rounded border border-gray-700">{item.style}</span>
                                    {item.type && <span className="text-[10px] bg-purple-900/20 text-purple-400 px-1.5 rounded border border-purple-900/30">{item.type}</span>}
                                    {(item.aliases || []).map((a: string, i: number) => <span key={i} className="text-[10px] bg-gray-800 text-gray-400 border border-gray-700 px-1.5 rounded">{a}</span>)}
                                </div>
                            </div>
                            <div className="text-xs text-gray-400 space-y-2 mt-2">
                                <div className="bg-gray-900 p-2 rounded border border-gray-800/50">
                                     <span className="text-emerald-500/70 font-semibold block mb-0.5 text-[10px] uppercase">氛围</span>
                                     <p className="line-clamp-2 italic">{item.atmosphere}</p>
                                </div>
                                <p className="line-clamp-2"><span className="text-gray-600 font-semibold">细节:</span> {item.description}</p>
                            </div>
                        </>
                    )}
                </div>
            ))}
        </div>
    </div>
  );

  const renderSection = (title: string, colorClass: string, groups: Record<string, any[]>) => {
      const isCollapsed = collapsedSections[title];
      const count = Object.values(groups).reduce((acc, curr) => acc + curr.length, 0);

      return (
          <div key={title} className="mb-8">
               <div 
                  className={`flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors border ${colorClass} bg-opacity-10 mb-4 select-none`}
                  onClick={() => toggleSection(title)}
               >
                   <div className="flex items-center gap-3">
                        {isCollapsed ? <ChevronRight className="w-5 h-5 opacity-50"/> : <ChevronDown className="w-5 h-5 opacity-50"/>}
                        <h3 className="text-lg font-bold text-white tracking-wide">{title}</h3>
                        <span className="text-xs bg-gray-950/50 text-gray-400 px-2 py-0.5 rounded-full">{Object.keys(groups).length} 组 / {count} 项</span>
                   </div>
                   <div className="h-px bg-current flex-1 ml-4 opacity-20"></div>
               </div>
               
               {!isCollapsed && (
                   Object.keys(groups).length === 0 ? (
                       <div className="text-center py-6 border border-dashed border-gray-800 rounded-lg text-gray-600 text-sm">暂无{title}</div>
                   ) : (
                        viewMode === 'masonry' ? (
                            <div className="columns-1 md:columns-2 lg:columns-3 gap-6 space-y-6">
                                {Object.entries(groups).map(([group, items]) => renderGroupContent(group, items))}
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {Object.entries(groups).map(([group, items]) => renderGroupContent(group, items))}
                            </div>
                        )
                   )
               )}
          </div>
      );
  }

  return (
    <div className="h-full flex flex-col relative">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-white mb-1">设定提取 (Entity Extraction)</h2>
          <p className="text-gray-400 text-sm">深度分析角色详情、生理形态、服装及场景建筑结构。</p>
        </div>
        <div className="flex gap-3 items-center">
             {error && <span className="text-red-400 text-sm flex items-center gap-2"><AlertCircle className="w-4 h-4"/> {error}</span>}
             
             {/* Custom Prompt Indicator */}
             {hasCustomPrompt && !loading && (
                 <div className="flex items-center gap-1.5 bg-yellow-900/30 border border-yellow-900/50 text-yellow-500 px-3 py-1.5 rounded-lg text-xs" title="当前正在使用自定义提示词配置">
                     <Wrench className="w-3.5 h-3.5" />
                     <span>Custom Config</span>
                 </div>
             )}

             {hasData && (
                <>
                    <button 
                        onClick={downloadDebugData}
                        className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 text-gray-300 px-4 py-2.5 rounded-lg text-sm font-medium transition-all"
                        title="下载原始分析数据以便调试"
                    >
                        <Bug className="w-4 h-4"/> 调试数据
                    </button>
                    <button 
                        onClick={handleEnrichClick}
                        disabled={isEnriching}
                        className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-all shadow-lg"
                        title="自动补充缺失的描述和修正年龄"
                    >
                        {isEnriching ? <Loader2 className="w-4 h-4 animate-spin"/> : <Wand2 className="w-4 h-4"/>}
                        {isEnriching ? '补全中...' : '智能补全'}
                    </button>
                </>
             )}

            <button
            onClick={handleAnalyzeClick}
            disabled={loading || isStarting}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-5 py-2.5 rounded-lg font-medium transition-all shadow-lg shadow-indigo-900/20"
            >
            {(loading || isStarting) ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {hasData ? '重新分析全文' : '开始分析全文'}
            </button>
        </div>
      </div>

      {loading && (
        <div className="absolute inset-0 z-10 bg-gray-950/80 backdrop-blur-sm flex flex-col items-center justify-center rounded-xl pointer-events-auto">
           <div className="w-64">
               <div className="flex justify-between text-xs text-indigo-400 mb-1">
                   <span>{statusText}</span>
                   <span>{progress}%</span>
               </div>
               <div className="w-full bg-gray-800 rounded-full h-2 overflow-hidden">
                   <div className="bg-indigo-500 h-full transition-all duration-300 ease-out" style={{width: `${progress}%`}}></div>
               </div>
           </div>
           <p className="mt-4 text-gray-400 text-sm animate-pulse">AI 正在深度思考... 您可以切换页面，分析将在后台继续。</p>
           
           <button 
             onClick={onCancelAnalysis}
             className="mt-6 px-4 py-2 bg-red-900/30 hover:bg-red-900/50 text-red-400 rounded-lg text-sm border border-red-900/50 transition-colors flex items-center gap-2"
           >
             <X className="w-4 h-4" /> 取消分析
           </button>
        </div>
      )}

      {/* Main Content Areas ... (Grid/Masonry) */}
      {!hasData && !loading && (
        <div className="flex-1 flex flex-col items-center justify-center bg-gray-900/30 rounded-xl border border-gray-800">
          <Sparkles className="w-12 h-12 text-gray-700 mb-4" />
          <p className="text-gray-500">暂无数据，请点击右上角开始分析。</p>
        </div>
      )}

      {hasData && (
        <div className="flex-1 overflow-hidden flex flex-col">
          {/* Tabs */}
          <div className="flex justify-between items-center border-b border-gray-800 mb-6 pb-2">
            <div className="flex gap-6">
                <button onClick={() => setActiveTab('chars')} className={`pb-3 text-sm font-medium transition-colors relative ${activeTab === 'chars' ? 'text-indigo-400' : 'text-gray-500 hover:text-gray-300'}`}>
                角色库 ({Object.keys(allCharGroups).length} 组)
                {activeTab === 'chars' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-indigo-500" />}
                </button>
                <button onClick={() => setActiveTab('scenes')} className={`pb-3 text-sm font-medium transition-colors relative ${activeTab === 'scenes' ? 'text-indigo-400' : 'text-gray-500 hover:text-gray-300'}`}>
                场景库 ({Object.keys(allSceneGroups).length} 地点)
                {activeTab === 'scenes' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-indigo-500" />}
                </button>
            </div>
            
            <div className="flex items-center gap-2 mb-2">
                <div className="flex bg-gray-900 rounded-lg p-0.5 border border-gray-800">
                    <button onClick={() => setViewMode('grid')} className={`p-1.5 rounded ${viewMode === 'grid' ? 'bg-gray-800 text-white' : 'text-gray-500 hover:text-gray-300'}`}><LayoutGrid className="w-4 h-4" /></button>
                    <button onClick={() => setViewMode('masonry')} className={`p-1.5 rounded ${viewMode === 'masonry' ? 'bg-gray-800 text-white' : 'text-gray-500 hover:text-gray-300'}`}><LayoutTemplate className="w-4 h-4" /></button>
                </div>
                
                <button onClick={() => { setIsNew(true); const groupName = activeTab === 'chars' ? '新角色组' : '新地点'; activeTab === 'chars' ? setEditingChar(getEmptyChar(groupName, '配角')) : setEditingScene(getEmptyScene(groupName)); }} className="flex items-center gap-1 text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-1.5 rounded transition-colors"><Plus className="w-3 h-3"/> 新增{activeTab === 'chars' ? '角色' : '场景'}</button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto pr-2 pb-10 custom-scrollbar">
              {activeTab === 'chars' ? (
                  <>
                    {renderSection('主要角色', 'border-red-500 bg-red-900 text-red-100', characterCategories['主要角色'])}
                    {renderSection('次要角色', 'border-orange-500 bg-orange-900 text-orange-100', characterCategories['次要角色'])}
                    {renderSection('配角', 'border-indigo-500 bg-indigo-900 text-indigo-100', characterCategories['配角'])}
                    {renderSection('路人甲', 'border-gray-600 bg-gray-800 text-gray-300', characterCategories['路人甲'])}
                  </>
              ) : (
                  <>
                    {renderSection('主要场景', 'border-emerald-500 bg-emerald-900 text-emerald-100', sceneCategories['主要场景'])}
                    {renderSection('次要场景', 'border-blue-500 bg-blue-900 text-blue-100', sceneCategories['次要场景'])}
                    {renderSection('过场', 'border-gray-600 bg-gray-800 text-gray-300', sceneCategories['过场'])}
                  </>
              )}
          </div>
        </div>
      )}

      {/* Character Editing Modal */}
      {editingChar && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
              <div className="bg-gray-900 w-full max-w-2xl rounded-xl border border-gray-800 shadow-2xl flex flex-col max-h-[90vh]">
                  <div className="p-4 border-b border-gray-800 flex justify-between items-center bg-gray-950 rounded-t-xl">
                      <h3 className="text-lg font-bold text-white">{isNew ? '新增角色' : '编辑角色'}</h3>
                      <button onClick={() => setEditingChar(null)}><X className="w-5 h-5 text-gray-500"/></button>
                  </div>
                  <div className="p-6 overflow-y-auto space-y-4 custom-scrollbar">
                       {/* Basic Info */}
                       <div className="grid grid-cols-2 gap-4">
                          <div>
                              <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">形态名称</label>
                              <input type="text" value={editingChar.name} onChange={e => setEditingChar({...editingChar, name: e.target.value})} className="w-full bg-gray-950 border border-gray-800 rounded p-2 text-white" placeholder="如: 孙悟空-行者形态" />
                          </div>
                          <div>
                              <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">角色分级 (Role)</label>
                              <select value={editingChar.role || '配角'} onChange={e => setEditingChar({...editingChar, role: e.target.value as CharacterRole})} className="w-full bg-gray-950 border border-gray-800 rounded p-2 text-white">
                                  {CHARACTER_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                              </select>
                          </div>
                       </div>
                       
                       <div>
                           <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">视觉年龄</label>
                           <select value={editingChar.age} onChange={e => setEditingChar({...editingChar, age: e.target.value})} className="w-full bg-gray-950 border border-gray-800 rounded p-2 text-white">{VISUAL_AGE_OPTIONS.map(o=><option key={o} value={o}>{o}</option>)}</select>
                       </div>

                       <div>
                           <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">人物小传 (Description)</label>
                           <textarea value={editingChar.description} onChange={e => setEditingChar({...editingChar, description: e.target.value})} className="w-full h-24 bg-gray-950 border border-gray-800 rounded p-2 text-white text-sm" placeholder="性格、背景、身份..." />
                       </div>

                       <div>
                           <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">外貌特征 (Visuals)</label>
                           <textarea value={editingChar.visualMemoryPoints} onChange={e => setEditingChar({...editingChar, visualMemoryPoints: e.target.value})} className="w-full h-24 bg-gray-950 border border-gray-800 rounded p-2 text-white text-sm" placeholder="性别、体型、发型、发色、脸型、眼睛瞳孔、肤色、脸部特征..." />
                       </div>
                       
                       {/* Clothing Styles */}
                       <div className="border border-indigo-500/30 bg-indigo-900/10 rounded-xl p-4">
                          <label className="block text-sm font-bold text-indigo-300 uppercase mb-3 flex items-center gap-2"><Shirt className="w-4 h-4"/> 服装造型</label>
                          {(editingChar.clothingStyles || []).map((c, i) => (
                              <div key={i} className="flex gap-2 mb-2">
                                  <input value={c.phase} onChange={e=>{const n=[...editingChar.clothingStyles];n[i].phase=e.target.value;setEditingChar({...editingChar, clothingStyles:n})}} className="bg-gray-950 border border-indigo-900/50 rounded p-1.5 text-white text-xs w-1/3" placeholder="时期/状态 (如: 战损版)"/>
                                  <div className="flex-1 flex gap-1">
                                      <input value={c.description} onChange={e=>{const n=[...editingChar.clothingStyles];n[i].description=e.target.value;setEditingChar({...editingChar, clothingStyles:n})}} className="bg-gray-950 border border-indigo-900/50 rounded p-1.5 text-white text-xs flex-1" placeholder="服装描述细节"/>
                                      <button onClick={()=>{const n=[...editingChar.clothingStyles];n.splice(i,1);setEditingChar({...editingChar, clothingStyles:n})}} className="p-1 hover:bg-red-900/30 text-gray-500 hover:text-red-400 rounded"><Trash2 className="w-3.5 h-3.5"/></button>
                                  </div>
                              </div>
                          ))}
                          <button onClick={()=>setEditingChar({...editingChar, clothingStyles:[...(editingChar.clothingStyles||[]), {phase:'',description:''}]})} className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 mt-2"><Plus className="w-3 h-3"/> 添加服装</button>
                       </div>

                       {/* Weapons */}
                       <div className="border border-red-500/30 bg-red-900/10 rounded-xl p-4">
                          <label className="block text-sm font-bold text-red-300 uppercase mb-3 flex items-center gap-2"><Sword className="w-4 h-4"/> 武器装备</label>
                          {(editingChar.weapons || []).map((w, i) => (
                              <div key={i} className="flex gap-2 mb-2">
                                  <input value={w.name} onChange={e=>{const n=[...editingChar.weapons];n[i].name=e.target.value;setEditingChar({...editingChar, weapons:n})}} className="bg-gray-950 border border-red-900/50 rounded p-1.5 text-white text-xs w-1/3" placeholder="武器名"/>
                                  <div className="flex-1 flex gap-1">
                                      <input value={w.description} onChange={e=>{const n=[...editingChar.weapons];n[i].description=e.target.value;setEditingChar({...editingChar, weapons:n})}} className="bg-gray-950 border border-red-900/50 rounded p-1.5 text-white text-xs flex-1" placeholder="外观描述"/>
                                      <button onClick={()=>{const n=[...editingChar.weapons];n.splice(i,1);setEditingChar({...editingChar, weapons:n})}} className="p-1 hover:bg-red-900/30 text-gray-500 hover:text-red-400 rounded"><Trash2 className="w-3.5 h-3.5"/></button>
                                  </div>
                              </div>
                          ))}
                          <button onClick={()=>setEditingChar({...editingChar, weapons:[...(editingChar.weapons||[]), {name:'',description:''}]})} className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1 mt-2"><Plus className="w-3 h-3"/> 添加武器</button>
                       </div>
                  </div>
                  <div className="p-4 border-t border-gray-800 flex justify-end gap-3 bg-gray-950 rounded-b-xl">
                      <button onClick={() => setEditingChar(null)} className="px-4 py-2 rounded text-gray-400 hover:bg-gray-800">取消</button>
                      <button onClick={() => saveCharacter(editingChar)} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 rounded text-white font-medium">保存</button>
                  </div>
              </div>
          </div>
      )}

      {/* Scene Editing Modal */}
      {editingScene && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
               <div className="bg-gray-900 w-full max-w-2xl rounded-xl border border-gray-800 shadow-2xl flex flex-col max-h-[90vh]">
                   <div className="p-4 border-b border-gray-800 flex justify-between items-center bg-gray-950 rounded-t-xl">
                      <h3 className="text-lg font-bold text-white">{isNew ? '新增场景' : '编辑场景'}</h3>
                      <button onClick={() => setEditingScene(null)}><X className="w-5 h-5 text-gray-500"/></button>
                  </div>
                  <div className="p-6 overflow-y-auto space-y-4 custom-scrollbar">
                      <div className="grid grid-cols-2 gap-4">
                          <div>
                              <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">场景名称</label>
                              <input type="text" value={editingScene.name} onChange={e => setEditingScene({...editingScene, name: e.target.value})} className="w-full bg-gray-950 border border-gray-800 rounded p-2 text-white" placeholder="场景名" />
                          </div>
                          <div>
                              <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">类型 (Type)</label>
                              <select value={editingScene.type || '剧情节点'} onChange={e => setEditingScene({...editingScene, type: e.target.value as any})} className="w-full bg-gray-950 border border-gray-800 rounded p-2 text-white">
                                  <option value="核心据点">核心据点 (主要场景)</option>
                                  <option value="剧情节点">剧情节点 (次要场景)</option>
                                  <option value="过场">过场 (Transition)</option>
                              </select>
                          </div>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4">
                          <div>
                               <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">结构 (Structure)</label>
                               <select value={editingScene.structure} onChange={e => setEditingScene({...editingScene, structure: e.target.value as any})} className="w-full bg-gray-950 border border-gray-800 rounded p-2 text-white">
                                   <option value="内景">内景 (Interior)</option>
                                   <option value="外景">外景 (Exterior)</option>
                               </select>
                          </div>
                          <div>
                               <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">美术风格 (Style)</label>
                               <input type="text" value={editingScene.style} onChange={e => setEditingScene({...editingScene, style: e.target.value})} className="w-full bg-gray-950 border border-gray-800 rounded p-2 text-white" placeholder="如: 赛博朋克, 古风..." />
                          </div>
                      </div>

                      <div>
                          <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">别名 (Aliases)</label>
                          <input 
                            type="text" 
                            value={(editingScene.aliases || []).join(', ')} 
                            onChange={e => setEditingScene({...editingScene, aliases: e.target.value.split(/[,，]/).map(s=>s.trim()).filter(Boolean)})} 
                            className="w-full bg-gray-950 border border-gray-800 rounded p-2 text-white text-sm" 
                            placeholder="逗号分隔别名..." 
                          />
                      </div>

                      <div>
                          <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">光影与氛围 (Atmosphere)</label>
                          <textarea value={editingScene.atmosphere} onChange={e => setEditingScene({...editingScene, atmosphere: e.target.value})} className="w-full h-20 bg-gray-950 border border-gray-800 rounded p-2 text-white text-sm" placeholder="阴森, 阳光明媚, 霓虹闪烁..." />
                      </div>

                      <div>
                          <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">详细描述 (Description)</label>
                          <textarea value={editingScene.description} onChange={e => setEditingScene({...editingScene, description: e.target.value})} className="w-full h-24 bg-gray-950 border border-gray-800 rounded p-2 text-white text-sm" placeholder="场景视觉细节..." />
                      </div>
                  </div>
                  <div className="p-4 border-t border-gray-800 flex justify-end gap-3 bg-gray-950 rounded-b-xl">
                      <button onClick={() => setEditingScene(null)} className="px-4 py-2 rounded text-gray-400 hover:bg-gray-800">取消</button>
                      <button onClick={() => saveScene(editingScene)} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 rounded text-white font-medium">保存</button>
                  </div>
               </div>
          </div>
      )}

    </div>
  );
};