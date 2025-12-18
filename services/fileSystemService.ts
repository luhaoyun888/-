import { Project } from "../types";

// Helper type for FileSystemHandle (browser native API)
// We treat it as any here to avoid complex typescript defs for the experimental API if not present in env
export interface FileSystemConfig {
  dirHandle: any;
}

export const fileSystem = {
  
  /**
   * Prompts user to select a directory to store projects.
   */
  async openDirectory(): Promise<any> {
    if (!('showDirectoryPicker' in window)) {
      throw new Error("您的浏览器不支持本地文件系统访问 (File System Access API)。建议使用 Chrome 或 Edge。");
    }
    
    // Safety check for cross-origin iframes
    if (window.self !== window.top) {
        throw new Error("安全限制：无法在预览框架(Iframe)中直接访问本地文件系统。请在独立窗口中打开应用以使用此功能。");
    }

    try {
      const dirHandle = await (window as any).showDirectoryPicker({
        mode: 'readwrite'
      });
      return dirHandle;
    } catch (e: any) {
      // User cancelled or error
      console.error(e);
      if (e.name === 'SecurityError' || (e.message && e.message.includes('Cross origin sub frames'))) {
          throw new Error("安全限制：无法在当前预览环境或框架中访问本地文件。");
      }
      throw e;
    }
  },

  /**
   * Scans the directory for .json files and attempts to parse them as Projects.
   */
  async loadProjectsFromDirectory(dirHandle: any): Promise<Project[]> {
    const projects: Project[] = [];
    
    // Request permission if needed
    try {
        if ((await dirHandle.queryPermission({ mode: 'read' })) !== 'granted') {
           if ((await dirHandle.requestPermission({ mode: 'read' })) !== 'granted') {
               throw new Error("Permission denied to read directory");
           }
        }
    } catch (e) {
        console.error("Permission check failed", e);
        throw new Error("无法获取目录读取权限。");
    }

    for await (const entry of dirHandle.values()) {
       if (entry.kind === 'file' && entry.name.endsWith('.json')) {
           try {
               const file = await entry.getFile();
               const text = await file.text();
               const data = JSON.parse(text);
               // Simple validation
               if (data.id && data.title && Array.isArray(data.chapters)) {
                   projects.push(data);
               }
           } catch (e) {
               console.warn(`Failed to parse file ${entry.name}`, e);
           }
       }
    }
    return projects;
  },

  /**
   * Saves a single project as a JSON file in the directory.
   */
  async saveProjectToDirectory(dirHandle: any, project: Project): Promise<void> {
      if (!dirHandle) return;

      // Sanitize filename
      const safeTitle = project.title.replace(/[^a-z0-9\u4e00-\u9fa5]/gi, '_').substring(0, 50);
      const fileName = `${safeTitle}_${project.id.substring(0, 6)}.json`;

      try {
          const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
          const writable = await fileHandle.createWritable();
          await writable.write(JSON.stringify(project, null, 2));
          await writable.close();
      } catch (e) {
          console.error("Failed to save project to disk", e);
          throw new Error("保存文件失败，请检查目录权限。");
      }
  }
};