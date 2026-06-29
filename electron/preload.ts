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
  status:
    | "idle"
    | "checking"
    | "available"
    | "unavailable"
    | "error"
    | "downloaded";
  message: string;
  downloaded: boolean;
};

type CloseDecision = "save" | "discard" | "cancel";

contextBridge.exposeInMainWorld("esyEditor", {
  openFile: () => ipcRenderer.invoke("dialog:openFile"),
  openFolder: () => ipcRenderer.invoke("dialog:openFolder"),
  saveFile: (suggestedPath?: string) => ipcRenderer.invoke("dialog:saveFile", suggestedPath),
  readFile: (path: string) => ipcRenderer.invoke("file:read", path),
  writeFile: (path: string, content: string) => ipcRenderer.invoke("file:write", { path, content }),
  listDirectory: (path: string) => ipcRenderer.invoke("file:listDirectory", path),
  getAppInfo: () => ipcRenderer.invoke("app:getInfo"),
  checkForUpdates: () => ipcRenderer.invoke("app:checkForUpdates"),
  triggerUpdateCheck: () => ipcRenderer.invoke("app:triggerUpdateCheck"),
  installUpdate: () => ipcRenderer.invoke("app:installUpdate"),
  resolveCloseRequest: (requestId: number, decision: CloseDecision) =>
    ipcRenderer.invoke("app:resolveCloseRequest", { requestId, decision }),
  minimizeWindow: () => ipcRenderer.invoke("window:minimize"),
  toggleMaximizeWindow: () => ipcRenderer.invoke("window:toggleMaximize"),
  isWindowMaximized: () => ipcRenderer.invoke("window:isMaximized"),
  requestCloseWindow: () => ipcRenderer.invoke("window:requestClose"),
  onUpdateStatusChange: (callback: (payload: UpdateResult) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: UpdateResult) => callback(payload);
    ipcRenderer.on("app:update-status", listener);
    return () => {
      ipcRenderer.removeListener("app:update-status", listener);
    };
  },
  onCloseRequested: (callback: (requestId: number) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, requestId: number) => callback(requestId);
    ipcRenderer.on("app:close-requested", listener);
    return () => {
      ipcRenderer.removeListener("app:close-requested", listener);
    };
  },
  onMaximizedChange: (callback: (maximized: boolean) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, maximized: boolean) => callback(maximized);
    ipcRenderer.on("window:maximized-changed", listener);
    return () => {
      ipcRenderer.removeListener("window:maximized-changed", listener);
    };
  },
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
      triggerUpdateCheck: () => Promise<boolean>;
      installUpdate: () => Promise<boolean>;
      resolveCloseRequest: (requestId: number, decision: CloseDecision) => Promise<boolean>;
      minimizeWindow: () => Promise<boolean>;
      toggleMaximizeWindow: () => Promise<boolean>;
      isWindowMaximized: () => Promise<boolean>;
      requestCloseWindow: () => Promise<boolean>;
      onUpdateStatusChange: (callback: (payload: UpdateResult) => void) => () => void;
      onCloseRequested: (callback: (requestId: number) => void) => () => void;
      onMaximizedChange: (callback: (maximized: boolean) => void) => () => void;
    };
  }
}

export {};
