import { contextBridge, ipcRenderer } from "electron";

type WorkspaceEntry = {
  name: string;
  path: string;
  isDirectory: boolean;
};

type AppInfo = {
  name: string;
  version: string;
  platform: string;
  packaged: boolean;
};

type UpdateResult = {
  status: "idle" | "checking" | "available" | "unavailable" | "error";
  message: string;
};

contextBridge.exposeInMainWorld("esyEditor", {
  openFile: () => ipcRenderer.invoke("dialog:openFile"),
  openFolder: () => ipcRenderer.invoke("dialog:openFolder"),
  saveFile: (suggestedPath?: string) => ipcRenderer.invoke("dialog:saveFile", suggestedPath),
  readFile: (path: string) => ipcRenderer.invoke("file:read", path),
  writeFile: (path: string, content: string) =>
    ipcRenderer.invoke("file:write", { path, content }),
  listDirectory: (path: string) => ipcRenderer.invoke("file:listDirectory", path),
  getAppInfo: () => ipcRenderer.invoke("app:getInfo"),
  checkForUpdates: () => ipcRenderer.invoke("app:checkForUpdates"),
});

declare global {
  interface Window {
    esyEditor: {
      openFile: () => Promise<{ path: string; content: string } | null>;
      openFolder: () => Promise<{ path: string; entries: WorkspaceEntry[] } | null>;
      saveFile: (suggestedPath?: string) => Promise<{ path: string } | null>;
      readFile: (path: string) => Promise<{ path: string; content: string }>;
      writeFile: (path: string, content: string) => Promise<boolean>;
      listDirectory: (path: string) => Promise<{ path: string; entries: WorkspaceEntry[] }>;
      getAppInfo: () => Promise<AppInfo>;
      checkForUpdates: () => Promise<UpdateResult>;
    };
  }
}

export {};
