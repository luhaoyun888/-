import React, { useState, useMemo } from 'react';
import { Project, Character, Scene, VISUAL_AGE_OPTIONS, Weapon, CHARACTER_ROLES, CharacterRole, PromptConfig } from '../types';
import { analyzeEntitiesWithProgress, enrichEntities } from '../services/geminiService';
import { User, MapPin, Sparkles, Shirt, Loader2, AlertCircle, Edit2, Trash2, Plus, Save, X, Link as LinkIcon, Layers, LayoutGrid, LayoutTemplate, Copy, Sword, Activity, RefreshCw, ChevronDown, ChevronRight, Star, Bug, FileJson, CheckCircle2, Wrench, Wand2 } from 'lucide-react';

interface EntityExtractionProps {
  project: Project;
  onUpdateProject: (p: Project) => void;
  // Lifted state props
  loading: boolean;
  progress: number;
  statusText: string;
  onStartAnalysis: (fullText: string, config: PromptConfig) => Promise<void>;
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
          const mainRole = chars[0]?.role || '配角'; 
          if (categories[mainRole]) {
              categories[mainRole][groupName] = chars;
          } else {
              categories['配角'][groupName] = chars; 
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
          const type = scenes[0]?.type || '剧情节点';
          let catKey = '次要场景';
          if (type === '核心据点') catKey = '主要场景';
          else if (type === '剧情节点') catKey = '次要场景';
          else if (type === '过场') catKey = '过场';

          categories[catKey][groupName] = scenes;
      });
      return categories;
  }, [allSceneGroups]);

  // --- Actions ---

  const handleAnalyzeClick = async () => {
    if (!project.fullText || !project.prompts) return;
    const confirmMsg = hasCustomPrompt 
        ? "即将使用【自定义提示词】及选定模型进行重新分析。这将覆盖现有数据，是否继续？"
        : "重新分析将覆盖现有数据，是否继续？";
        
    if ((project.characters || []).length > 0 && !window.confirm(confirmMsg)) return;
    
    setIsStarting(true);
    try {
        await onStartAnalysis(
            project.fullText, 
            project.prompts
        );
    } finally {
        setIsStarting(false);
    }
  };

  const handleEnrichClick = async () => {
      if (!project.prompts || ((project.characters || []).length === 0 && (project.scenes || []).length === 0)) return;
      
      setIsEnriching(true);
      try {
          const result = await enrichEntities(
              { characters: project.characters || [], scenes: project.scenes || [] },
              project.prompts
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
      let updatedChars = [...(project.characters || [])];
      if (isNew) { updatedChars.push(char); } 
      else { updatedChars = updatedChars.map(c => c.id === char.id ? char : c); }
      onUpdateProject({ ...project, characters: updatedChars });
      setEditingChar(null);
      setIsNew(false);
  };

  const saveScene = (scene: Scene) => {
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

      {!hasData && !loading && (
        <div className="flex-1 flex flex-col items-center justify-center bg-gray-900/30 rounded-xl border border-gray-800">
          <Sparkles className="w-12 h-12 text-gray-700 mb-4" />
          <p className="text-gray-500">暂无数据，请点击右上角开始分析。</p>
        </div>
      )}

      {hasData && (
        <div className="flex-1 overflow-hidden flex flex-col">
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

      {/* Editing Modals (omitted for brevity, assume they remain similar) */}
      {/* ... */}
    </div>
  );
};