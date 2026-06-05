type WorkspaceEntry = {
  name: string;
  path: string;
  isDirectory: boolean;
};

type FilePayload = {
  path: string;
  content: string;
};

type FolderPayload = {
  path: string;
  entries: WorkspaceEntry[];
};

type EditorBridge = {
  openFile: () => Promise<FilePayload | null>;
  openFolder: () => Promise<FolderPayload | null>;
  saveFile: (suggestedPath?: string) => Promise<{ path: string } | null>;
  readFile: (path: string) => Promise<FilePayload>;
  writeFile: (path: string, content: string) => Promise<boolean>;
  listDirectory: (path: string) => Promise<FolderPayload>;
  getAppInfo: () => Promise<{
    name: string;
    version: string;
    platform: string;
    packaged: boolean;
  }>;
  checkForUpdates: () => Promise<{
    status: "idle" | "checking" | "available" | "unavailable" | "error";
    message: string;
  }>;
};

const browserFilePath = "browser-preview.md";
const browserFolderPath = "browser-workspace";
const browserStorageKey = "esy-text-editor.browser-preview";

function readBrowserContent() {
  return window.localStorage.getItem(browserStorageKey) ?? [
    "# Esy Text Editor",
    "",
    "Browser preview mode is active.",
    "",
    "- `npm run dev` serves the renderer only",
    "- `npm run dev:desktop` launches Electron",
    "- Content is persisted in localStorage during browser preview",
  ].join("\n");
}

const browserBridge: EditorBridge = {
  async openFile() {
    return {
      path: browserFilePath,
      content: readBrowserContent(),
    };
  },
  async openFolder() {
    return {
      path: browserFolderPath,
      entries: [
        {
          name: browserFilePath,
          path: browserFilePath,
          isDirectory: false,
        },
      ],
    };
  },
  async saveFile(suggestedPath) {
    return { path: suggestedPath || browserFilePath };
  },
  async readFile(path) {
    return {
      path,
      content: readBrowserContent(),
    };
  },
  async writeFile(_path, content) {
    window.localStorage.setItem(browserStorageKey, content);
    return true;
  },
  async listDirectory(path) {
    return {
      path,
      entries: [
        {
          name: browserFilePath,
          path: browserFilePath,
          isDirectory: false,
        },
      ],
    };
  },
  async getAppInfo() {
    return {
      name: "Esy Text Editor",
      version: "1.0.0",
      platform: "browser",
      packaged: false,
    };
  },
  async checkForUpdates() {
    return {
      status: "unavailable",
      message: "Browser preview mode does not support update checks.",
    };
  },
};

export const editorBridge: EditorBridge =
  typeof window !== "undefined" && window.esyEditor ? window.esyEditor : browserBridge;
