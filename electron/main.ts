import { app, BrowserWindow, dialog, ipcMain, Menu } from "electron";
import { existsSync } from "node:fs";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { autoUpdater } from "electron-updater";

const isDev = !app.isPackaged;
const appDisplayName = "Esy Text Editor";

type FileEntry = {
  name: string;
  path: string;
  isDirectory: boolean;
};

type UpdatePayload = {
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

const windowState = {
  lastDirectory: process.cwd(),
};

let mainWindow: BrowserWindow | null = null;
let allowClose = false;
let isUpdateDownloaded = false;
let closeRequestSequence = 0;
const closeResolvers = new Map<number, (decision: CloseDecision) => void>();
let updateState: UpdatePayload = {
  status: "idle",
  message: "No update check has been run yet.",
  downloaded: false,
};

function resolveWindowIcon() {
  const candidatePaths = [
    join(process.cwd(), "buildResources", "icon.png"),
    join(process.cwd(), "public", "icon.svg"),
  ];

  return candidatePaths.find((candidatePath) => existsSync(candidatePath));
}

async function readDirectory(pathname: string) {
  const entries = await readdir(pathname, { withFileTypes: true });

  return entries
    .map((entry) => ({
      name: entry.name,
      path: join(pathname, entry.name),
      isDirectory: entry.isDirectory(),
    }))
    .sort((left, right) => {
      if (left.isDirectory !== right.isDirectory) {
        return left.isDirectory ? -1 : 1;
      }

      return left.name.localeCompare(right.name);
    }) as FileEntry[];
}

function sendUpdateState() {
  mainWindow?.webContents.send("app:update-status", updateState);
}

function setUpdateState(nextState: Omit<UpdatePayload, "downloaded">) {
  updateState = {
    ...nextState,
    downloaded: isUpdateDownloaded,
  };
  sendUpdateState();
}

function configureAutoUpdater() {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.forceDevUpdateConfig = isDev;

  autoUpdater.on("checking-for-update", () => {
    isUpdateDownloaded = false;
    setUpdateState({
      status: "checking",
      message: "Checking GitHub releases for updates...",
    });
  });

  autoUpdater.on("update-available", (info: any) => {
    isUpdateDownloaded = false;
    setUpdateState({
      status: "available",
      message: `Update ${info.version} is available. Downloading now...`,
    });
  });

  autoUpdater.on("update-not-available", () => {
    isUpdateDownloaded = false;
    setUpdateState({
      status: "unavailable",
      message: "You are already on the latest version.",
    });
  });

  autoUpdater.on("error", (error: any) => {
    isUpdateDownloaded = false;
    setUpdateState({
      status: "error",
      message: error?.message ? `Update failed: ${error.message}` : "Update check failed.",
    });
  });

  autoUpdater.on("update-downloaded", (info: any) => {
    isUpdateDownloaded = true;
    setUpdateState({
      status: "downloaded",
      message: `Update ${info.version} downloaded. Restart the app to install it.`,
    });
  });
}

async function askRendererForCloseDecision(window: BrowserWindow): Promise<CloseDecision> {
  const requestId = ++closeRequestSequence;

  return await new Promise<CloseDecision>((resolve) => {
    closeResolvers.set(requestId, resolve);
    window.webContents.send("app:close-requested", requestId);

    setTimeout(() => {
      const pending = closeResolvers.get(requestId);
      if (pending) {
        closeResolvers.delete(requestId);
        pending("cancel");
      }
    }, 120000);
  });
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1100,
    minHeight: 720,
    backgroundColor: "#0a0a0a",
    title: appDisplayName,
    icon: resolveWindowIcon(),
    autoHideMenuBar: true,
    frame: false,
    webPreferences: {
      preload: join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow = window;
  window.setMenuBarVisibility(false);
  window.removeMenu();

  const emitMaximizedState = () => {
    window.webContents.send("window:maximized-changed", window.isMaximized());
  };

  window.on("maximize", emitMaximizedState);
  window.on("unmaximize", emitMaximizedState);
  window.on("closed", () => {
    if (mainWindow === window) {
      mainWindow = null;
    }
  });

  window.on("close", async (event) => {
    if (allowClose) {
      return;
    }

    event.preventDefault();
    const decision = await askRendererForCloseDecision(window);
    if (decision === "cancel") {
      return;
    }

    allowClose = true;
    window.close();
  });

  if (isDev) {
    window.loadURL("http://localhost:5173");
    window.webContents.openDevTools({ mode: "detach" });
  } else {
    window.loadFile(join(app.getAppPath(), "dist", "index.html"));
  }

  window.webContents.on("did-finish-load", () => {
    emitMaximizedState();
    sendUpdateState();
  });
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  windowState.lastDirectory = app.getPath("documents");
  configureAutoUpdater();
  createWindow();

  autoUpdater.checkForUpdates().catch(() => {
    setUpdateState({
      status: "error",
      message: "Automatic update check failed during startup.",
    });
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

ipcMain.handle("dialog:openFile", async () => {
  const result = await dialog.showOpenDialog({
    title: "Open markdown file",
    defaultPath: windowState.lastDirectory,
    properties: ["openFile"],
    filters: [{ name: "Markdown", extensions: ["md", "markdown", "txt"] }],
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  const [filePath] = result.filePaths;
  windowState.lastDirectory = dirname(filePath);
  return {
    path: filePath,
    content: await readFile(filePath, "utf8"),
  };
});

ipcMain.handle("dialog:saveFile", async (_event, suggestedPath?: string) => {
  const result = await dialog.showSaveDialog({
    title: "Save markdown file",
    defaultPath: suggestedPath ?? windowState.lastDirectory,
    filters: [{ name: "Markdown", extensions: ["md", "markdown", "txt"] }],
  });

  if (result.canceled || !result.filePath) {
    return null;
  }

  windowState.lastDirectory = dirname(result.filePath);
  return { path: result.filePath };
});

ipcMain.handle("dialog:openFolder", async () => {
  const result = await dialog.showOpenDialog({
    title: "Open workspace folder",
    defaultPath: windowState.lastDirectory,
    properties: ["openDirectory"],
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  const [folderPath] = result.filePaths;
  windowState.lastDirectory = folderPath;
  return {
    path: folderPath,
    entries: await readDirectory(folderPath),
  };
});

ipcMain.handle("file:read", async (_event, filePath: string) => {
  const content = await readFile(filePath, "utf8");
  windowState.lastDirectory = dirname(filePath);
  return { path: filePath, content };
});

ipcMain.handle("file:write", async (_event, payload: { path: string; content: string }) => {
  await writeFile(payload.path, payload.content, "utf8");
  windowState.lastDirectory = dirname(payload.path);
  return true;
});

ipcMain.handle("file:listDirectory", async (_event, folderPath: string) => {
  windowState.lastDirectory = folderPath;
  return { path: folderPath, entries: await readDirectory(folderPath) };
});

ipcMain.handle("app:getInfo", async () => ({
  name: appDisplayName,
  version: app.getVersion(),
  platform: process.platform,
  packaged: app.isPackaged,
}));

ipcMain.handle("app:checkForUpdates", async () => updateState);

ipcMain.handle("app:triggerUpdateCheck", async () => {
  await autoUpdater.checkForUpdates();
  return true;
});

ipcMain.handle("app:installUpdate", async () => {
  if (!isUpdateDownloaded) {
    return false;
  }

  allowClose = true;
  autoUpdater.quitAndInstall();
  return true;
});

ipcMain.handle("app:resolveCloseRequest", async (_event, payload: { requestId: number; decision: CloseDecision }) => {
  const resolver = closeResolvers.get(payload.requestId);
  if (resolver) {
    closeResolvers.delete(payload.requestId);
    resolver(payload.decision);
  }
  return true;
});

ipcMain.handle("window:minimize", async (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  window?.minimize();
  return true;
});

ipcMain.handle("window:toggleMaximize", async (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window) {
    return false;
  }

  if (window.isMaximized()) {
    window.unmaximize();
  } else {
    window.maximize();
  }

  return window.isMaximized();
});

ipcMain.handle("window:isMaximized", async (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  return window?.isMaximized() ?? false;
});

ipcMain.handle("window:requestClose", async (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window) {
    return false;
  }

  const decision = await askRendererForCloseDecision(window);
  if (decision === "cancel") {
    return false;
  }

  allowClose = true;
  window.close();
  return true;
});
