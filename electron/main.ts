import { app, BrowserWindow, dialog, ipcMain } from "electron";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const isDev = !app.isPackaged;
const __dirname = dirname(fileURLToPath(import.meta.url));

type FileEntry = {
  name: string;
  path: string;
  isDirectory: boolean;
};

const windowState = {
  lastDirectory: process.cwd(),
};

function createWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1100,
    minHeight: 720,
    backgroundColor: "#0a0a0a",
    title: "Esy Text Editor",
    webPreferences: {
      preload: join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (isDev) {
    window.loadURL("http://localhost:5173");
    window.webContents.openDevTools({ mode: "detach" });
  } else {
    window.loadFile(join(app.getAppPath(), "dist", "index.html"));
  }
}

async function readDirectory(pathname: string) {
  const { readdir } = await import("node:fs/promises");
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

app.whenReady().then(() => {
  windowState.lastDirectory = app.getPath("documents");
  createWindow();

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
    filters: [
      { name: "Markdown", extensions: ["md", "markdown", "txt"] },
    ],
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
  name: app.getName(),
  version: app.getVersion(),
  platform: process.platform,
  packaged: app.isPackaged,
}));

ipcMain.handle("app:checkForUpdates", async () => ({
  status: "unavailable",
  message:
    "Auto-update is not configured yet. Package the app and wire a release feed before enabling this.",
}));
