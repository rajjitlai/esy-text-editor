import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  FileText,
  FolderOpen,
  Info,
  Loader2,
  Menu,
  Minus,
  Save,
  Search,
  Settings as SettingsIcon,
  Square,
  Sparkles,
  X,
} from "lucide-react";
import { Compartment, EditorSelection, EditorState } from "@codemirror/state";
import {
  drawSelection,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
} from "@codemirror/view";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "./components/ui/button";
import { Card } from "./components/ui/card";
import { Input } from "./components/ui/input";
import { editorBridge } from "./lib/bridge";
import { cn } from "./lib/cn";

type WorkspaceEntry = {
  name: string;
  path: string;
  isDirectory: boolean;
};

type DocumentTab = {
  id: string;
  title: string;
  path?: string;
  content: string;
  dirty: boolean;
  revision: number;
};

type AppInfo = {
  name: string;
  version: string;
  platform: string;
  packaged: boolean;
};

type UpdateState = {
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

type Preferences = {
  showPreview: boolean;
  wordWrap: boolean;
  invertTheme: boolean;
};

type PendingCloseState = {
  mode: "tab" | "app";
  tabId?: string;
  title?: string;
  requestId?: number;
};

type RecentFile = {
  path: string;
  title: string;
};

type FindState = {
  isFindOpen: boolean;
  isReplaceOpen: boolean;
  findQuery: string;
  replaceQuery: string;
  matchCount: number;
  activeMatchIndex: number;
};

type MatchRange = {
  from: number;
  to: number;
};

type EditorHandle = {
  getValue: () => string;
  setValue: (nextValue: string) => void;
  focus: () => void;
  wrapSelection: (before: string, after?: string) => void;
  insertPrefix: (prefix: string) => void;
  setSelection: (from: number, to: number) => void;
  getSelectionRange: () => MatchRange;
  replaceRange: (from: number, to: number, insert: string, selectInserted?: boolean) => void;
};

const defaultContent = [
  "# Esy Text Editor",
  "",
  "Write markdown here. Open a folder, switch between tabs, and preview the output live.",
  "",
  "- Minimal monochrome UI",
  "- Electron desktop shell",
  "- Markdown formatting tools",
].join("\n");

const preferencesStorageKey = "esy-text-editor.preferences";
const recentFilesStorageKey = "esy-text-editor.recent-files";
const maxRecentFiles = 10;

function createEmptyDocument(): DocumentTab {
  return {
    id: crypto.randomUUID(),
    title: "Untitled",
    content: defaultContent,
    dirty: false,
    revision: 0,
  };
}

function basename(path: string) {
  return path.split(/[\\/]/).pop() ?? path;
}

function loadPreferences(): Preferences {
  if (typeof window === "undefined") {
    return { showPreview: true, wordWrap: true, invertTheme: false };
  }

  try {
    const raw = window.localStorage.getItem(preferencesStorageKey);
    if (!raw) {
      return { showPreview: true, wordWrap: true, invertTheme: false };
    }

    const parsed = JSON.parse(raw) as Partial<Preferences>;
    return {
      showPreview: parsed.showPreview ?? true,
      wordWrap: parsed.wordWrap ?? true,
      invertTheme: parsed.invertTheme ?? false,
    };
  } catch {
    return { showPreview: true, wordWrap: true, invertTheme: false };
  }
}

function loadRecentFiles(): RecentFile[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(recentFilesStorageKey);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as RecentFile[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function App() {
  const [workspacePath, setWorkspacePath] = useState<string | null>(null);
  const [workspaceEntries, setWorkspaceEntries] = useState<WorkspaceEntry[]>([]);
  const [tabs, setTabs] = useState<DocumentTab[]>([createEmptyDocument()]);
  const [activeTabId, setActiveTabId] = useState<string>(tabs[0].id);
  const [searchTerm, setSearchTerm] = useState("");
  const [saving, setSaving] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState<"settings" | "about">("settings");
  const [appInfo, setAppInfo] = useState<AppInfo>({
    name: "Esy Text Editor",
    version: "1.0.0",
    platform: "browser",
    packaged: false,
  });
  const [updateState, setUpdateState] = useState<UpdateState>({
    status: "idle",
    message: "No update check has been run yet.",
    downloaded: false,
  });
  const [preferences, setPreferences] = useState<Preferences>(() => loadPreferences());
  const [pendingClose, setPendingClose] = useState<PendingCloseState | null>(null);
  const [windowMaximized, setWindowMaximized] = useState(false);
  const [recentFiles, setRecentFiles] = useState<RecentFile[]>(() => loadRecentFiles());
  const [findState, setFindState] = useState<FindState>({
    isFindOpen: false,
    isReplaceOpen: false,
    findQuery: "",
    replaceQuery: "",
    matchCount: 0,
    activeMatchIndex: 0,
  });
  const editorRef = useRef<EditorHandle | null>(null);
  const findInputRef = useRef<HTMLInputElement | null>(null);
  const replaceInputRef = useRef<HTMLInputElement | null>(null);

  const activeTab = useMemo(
    () => tabs.find((tab) => tab.id === activeTabId) ?? tabs[0],
    [tabs, activeTabId]
  );

  const hasDirtyTabs = useMemo(() => tabs.some((tab) => tab.dirty), [tabs]);

  const matches = useMemo(() => {
    if (!findState.isFindOpen || !activeTab || !findState.findQuery) {
      return [] as MatchRange[];
    }

    const content = activeTab.content;
    const query = findState.findQuery;
    const result: MatchRange[] = [];
    let start = 0;

    while (start <= content.length) {
      const index = content.indexOf(query, start);
      if (index === -1) {
        break;
      }

      result.push({ from: index, to: index + query.length });
      start = index + Math.max(query.length, 1);
    }

    return result;
  }, [findState.isFindOpen, activeTab, findState.findQuery]);

  const handleAppCloseRequestRef = useRef(handleAppCloseRequest);
  useEffect(() => {
    handleAppCloseRequestRef.current = handleAppCloseRequest;
  });

  const hasDirtyTabsRef = useRef(hasDirtyTabs);
  useEffect(() => {
    hasDirtyTabsRef.current = hasDirtyTabs;
  });

  const handleKeyDownRef = useRef<(event: KeyboardEvent) => void>(null);
  handleKeyDownRef.current = (event: KeyboardEvent) => {
    const modifierPressed = event.ctrlKey || event.metaKey;
    if (!modifierPressed) {
      if (event.key === "Escape" && findState.isFindOpen) {
        event.preventDefault();
        closeFindBar();
      }
      return;
    }

    const key = event.key.toLowerCase();
    if (key === "s" && event.shiftKey) {
      event.preventDefault();
      void saveActiveTabAs();
      return;
    }

    if (key === "s") {
      event.preventDefault();
      void saveActiveTab();
      return;
    }

    if (key === "w") {
      event.preventDefault();
      if (activeTab) {
        requestCloseTab(activeTab.id);
      }
      return;
    }

    if (key === "f") {
      event.preventDefault();
      openFindBar(false);
      return;
    }

    if (key === "h") {
      event.preventDefault();
      openFindBar(true);
    }
  };

  useEffect(() => {
    editorBridge
      .getAppInfo()
      .then(setAppInfo)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    editorBridge
      .checkForUpdates()
      .then(setUpdateState)
      .catch(() => undefined);

    return editorBridge.onUpdateStatusChange((payload) => {
      setUpdateState(payload);
    });
  }, []);

  useEffect(() => {
    editorBridge.isWindowMaximized().then(setWindowMaximized).catch(() => undefined);
    return editorBridge.onMaximizedChange((maximized) => {
      setWindowMaximized(maximized);
    });
  }, []);

  useEffect(() => {
    return editorBridge.onCloseRequested((requestId) => {
      handleAppCloseRequestRef.current(requestId);
    });
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(preferencesStorageKey, JSON.stringify(preferences));
    }
  }, [preferences]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(recentFilesStorageKey, JSON.stringify(recentFiles));
    }
  }, [recentFiles]);

  useEffect(() => {
    if (!findState.isFindOpen || !findState.findQuery) {
      setFindState((current) => ({
        ...current,
        matchCount: 0,
        activeMatchIndex: 0,
      }));
      return;
    }

    setFindState((current) => {
      const nextCount = matches.length;
      const nextIndex = nextCount === 0 ? 0 : Math.min(current.activeMatchIndex, nextCount - 1);
      return {
        ...current,
        matchCount: nextCount,
        activeMatchIndex: nextIndex,
      };
    });
  }, [matches, findState.isFindOpen, findState.findQuery]);

  useEffect(() => {
    if (findState.isFindOpen) {
      queueMicrotask(() => {
        findInputRef.current?.focus();
      });
    }
  }, [findState.isFindOpen, findState.isReplaceOpen]);

  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      handleKeyDownRef.current?.(event);
    };
    window.addEventListener("keydown", listener);
    return () => {
      window.removeEventListener("keydown", listener);
    };
  }, []);

  useEffect(() => {
    if (!findState.isFindOpen || !findState.findQuery || matches.length === 0) {
      return;
    }

    selectMatch(Math.min(findState.activeMatchIndex, matches.length - 1));
  }, [matches, findState.isFindOpen, findState.findQuery]);

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasDirtyTabsRef.current) {
        return;
      }

      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
    };
  }, []);

  function pushRecentFile(path: string) {
    const item = {
      path,
      title: basename(path),
    };

    setRecentFiles((current) => {
      const withoutCurrent = current.filter((entry) => entry.path !== path);
      return [item, ...withoutCurrent].slice(0, maxRecentFiles);
    });
  }

  function clearRecentFiles() {
    setRecentFiles([]);
  }

  async function openFolder() {
    const result = await editorBridge.openFolder();
    if (!result) {
      return;
    }

    setWorkspacePath(result.path);
    setWorkspaceEntries(result.entries);
    setSidebarOpen(false);
  }

  async function refreshWorkspace() {
    if (!workspacePath) {
      return;
    }

    const result = await editorBridge.listDirectory(workspacePath);
    setWorkspaceEntries(result.entries);
  }

  async function openWorkspaceDirectory(path: string) {
    const result = await editorBridge.listDirectory(path);
    setWorkspacePath(result.path);
    setWorkspaceEntries(result.entries);
    setSidebarOpen(false);
  }

  async function openFileDialog() {
    const result = await editorBridge.openFile();
    if (!result) {
      return;
    }

    await openFile(result.path);
  }

  async function openFile(path: string) {
    const result = await editorBridge.readFile(path);
    const existing = tabs.find((tab) => tab.path === path);

    if (existing) {
      setTabs((currentTabs) =>
        currentTabs.map((tab) =>
          tab.id === existing.id
            ? { ...tab, content: result.content, dirty: false, revision: tab.revision + 1 }
            : tab
        )
      );
      setActiveTabId(existing.id);
      pushRecentFile(path);
      setSidebarOpen(false);
      return;
    }

    const newTab: DocumentTab = {
      id: crypto.randomUUID(),
      title: basename(path),
      path,
      content: result.content,
      dirty: false,
      revision: 0,
    };

    setTabs((currentTabs) => [...currentTabs, newTab]);
    setActiveTabId(newTab.id);
    pushRecentFile(path);
    setSidebarOpen(false);
  }

  function updateActiveTabContent(nextContent: string) {
    setTabs((currentTabs) =>
      currentTabs.map((tab) =>
        tab.id === activeTabId ? { ...tab, content: nextContent, dirty: true } : tab
      )
    );
  }

  function applyFormatting(transform: (handle: EditorHandle) => void) {
    if (editorRef.current) {
      transform(editorRef.current);
    }
  }

  async function persistTab(tab: DocumentTab, saveAs = false) {
    const content = tab.id === activeTabId ? editorRef.current?.getValue() ?? tab.content : tab.content;
    const targetPath =
      saveAs || !tab.path
        ? (await editorBridge.saveFile(tab.path ?? tab.title))?.path ?? null
        : tab.path;

    if (!targetPath) {
      return false;
    }

    await editorBridge.writeFile(targetPath, content);
    pushRecentFile(targetPath);
    setTabs((currentTabs) =>
      currentTabs.map((currentTab) =>
        currentTab.id === tab.id
          ? {
              ...currentTab,
              path: targetPath,
              title: basename(targetPath),
              content,
              dirty: false,
              revision: currentTab.revision,
            }
          : currentTab
      )
    );
    return true;
  }

  async function saveActiveTab() {
    const currentTab = tabs.find((tab) => tab.id === activeTabId);
    if (!currentTab) {
      return;
    }

    setSaving(true);
    try {
      await persistTab(currentTab, false);
    } finally {
      setSaving(false);
    }
  }

  async function saveActiveTabAs() {
    const currentTab = tabs.find((tab) => tab.id === activeTabId);
    if (!currentTab) {
      return;
    }

    setSaving(true);
    try {
      await persistTab(currentTab, true);
    } finally {
      setSaving(false);
    }
  }

  async function saveTabById(tabId: string) {
    const target = tabs.find((tab) => tab.id === tabId);
    if (!target) {
      return false;
    }

    return await persistTab(target, false);
  }

  async function saveAllDirtyTabs() {
    const dirtyTabs = tabs.filter((tab) => tab.dirty);
    for (const dirtyTab of dirtyTabs) {
      const saved = await persistTab(dirtyTab, false);
      if (!saved) {
        return false;
      }
    }
    return true;
  }

  async function checkForUpdates() {
    try {
      await editorBridge.triggerUpdateCheck();
    } catch {
      setUpdateState({
        status: "error",
        message: "Update check failed.",
        downloaded: false,
      });
    }
  }

  async function installUpdate() {
    await editorBridge.installUpdate();
  }

  function newTab() {
    const tab = createEmptyDocument();
    setTabs((currentTabs) => [...currentTabs, tab]);
    setActiveTabId(tab.id);
  }

  function updatePreferences(next: Partial<Preferences>) {
    setPreferences((current) => ({ ...current, ...next }));
  }

  function closeTab(tabId: string) {
    setTabs((currentTabs) => {
      const index = currentTabs.findIndex((tab) => tab.id === tabId);
      if (index === -1) {
        return currentTabs;
      }

      const remainingTabs = currentTabs.filter((tab) => tab.id !== tabId);
      const nextTabs = remainingTabs.length > 0 ? remainingTabs : [createEmptyDocument()];

      if (tabId === activeTabId) {
        const fallbackTab = remainingTabs[index] ?? remainingTabs[index - 1] ?? nextTabs[0];
        setActiveTabId(fallbackTab.id);
      }

      return nextTabs;
    });
  }

  function requestCloseTab(tabId: string) {
    const targetTab = tabs.find((tab) => tab.id === tabId);
    if (!targetTab) {
      return;
    }

    if (targetTab.dirty) {
      setPendingClose({
        mode: "tab",
        tabId: targetTab.id,
        title: targetTab.title,
      });
      return;
    }

    closeTab(tabId);
  }

  function handleAppCloseRequest(requestId: number) {
    if (!hasDirtyTabs) {
      void editorBridge.resolveCloseRequest(requestId, "discard");
      return;
    }

    setPendingClose({
      mode: "app",
      requestId,
    });
  }

  async function resolvePendingClose(decision: "save" | "discard" | "cancel") {
    if (!pendingClose) {
      return;
    }

    const currentPending = pendingClose;
    setPendingClose(null);

    if (currentPending.mode === "tab") {
      if (decision === "cancel") {
        return;
      }

      if (decision === "save" && currentPending.tabId) {
        const saved = await saveTabById(currentPending.tabId);
        if (!saved) {
          return;
        }
      }

      if (currentPending.tabId) {
        closeTab(currentPending.tabId);
      }
      return;
    }

    if (currentPending.requestId == null) {
      return;
    }

    if (decision === "cancel") {
      await editorBridge.resolveCloseRequest(currentPending.requestId, "cancel");
      return;
    }

    if (decision === "save") {
      const saved = await saveAllDirtyTabs();
      if (!saved) {
        await editorBridge.resolveCloseRequest(currentPending.requestId, "cancel");
        return;
      }
    }

    await editorBridge.resolveCloseRequest(currentPending.requestId, decision === "save" ? "save" : "discard");
  }

  function openFindBar(withReplace: boolean) {
    setFindState((current) => ({
      ...current,
      isFindOpen: true,
      isReplaceOpen: withReplace,
    }));
  }

  function closeFindBar() {
    setFindState((current) => ({
      ...current,
      isFindOpen: false,
      isReplaceOpen: false,
      matchCount: 0,
      activeMatchIndex: 0,
    }));
    editorRef.current?.focus();
  }

  function selectMatch(index: number) {
    if (!editorRef.current || matches.length === 0) {
      return;
    }

    const normalized = ((index % matches.length) + matches.length) % matches.length;
    const match = matches[normalized];
    editorRef.current.setSelection(match.from, match.to);
    editorRef.current.focus();
    setFindState((current) => ({
      ...current,
      activeMatchIndex: normalized,
      matchCount: matches.length,
    }));
  }

  function goToNextMatch() {
    selectMatch(findState.activeMatchIndex + 1);
  }

  function goToPreviousMatch() {
    selectMatch(findState.activeMatchIndex - 1);
  }

  function replaceCurrentMatch() {
    if (!editorRef.current || matches.length === 0) {
      return;
    }

    const target = matches[Math.min(findState.activeMatchIndex, matches.length - 1)];
    editorRef.current.replaceRange(target.from, target.to, findState.replaceQuery, true);
  }

  function replaceAllMatches() {
    if (!activeTab || !findState.findQuery) {
      return;
    }

    const nextContent = activeTab.content.replace(
      new RegExp(escapeRegExp(findState.findQuery), "g"),
      findState.replaceQuery
    );
    setTabs((currentTabs) =>
      currentTabs.map((tab) =>
        tab.id === activeTab.id
          ? { ...tab, content: nextContent, dirty: true, revision: tab.revision + 1 }
          : tab
      )
    );
  }

  async function minimizeWindow() {
    await editorBridge.minimizeWindow();
  }

  async function toggleMaximizeWindow() {
    const maximized = await editorBridge.toggleMaximizeWindow();
    setWindowMaximized(maximized);
  }

  async function requestWindowClose() {
    await editorBridge.requestCloseWindow();
  }

  const filteredEntries = workspaceEntries.filter((entry) =>
    entry.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div
      className={cn(
        "h-screen w-screen overflow-hidden bg-background text-foreground select-none",
        preferences.invertTheme ? "theme-inverted" : ""
      )}
    >
      <div className="grid h-full grid-rows-[auto_auto_1fr] overflow-hidden">
        <div
          className="app-drag-region flex h-9 shrink-0 items-center justify-between border-b border-border bg-card/90 pl-3"
          onDoubleClick={() => {
            void toggleMaximizeWindow();
          }}
        >
          <div className="flex min-w-0 items-center gap-2">
            <img src="/icon.svg" alt="Esy Text Editor" className="h-4 w-4 rounded-sm" />
            <p className="truncate text-xs text-muted-foreground">
              {appInfo.name} | Markdown Workspace
            </p>
          </div>
          <div className="app-no-drag flex items-stretch">
            <button
              onClick={() => {
                void minimizeWindow();
              }}
              className="flex h-9 w-12 items-center justify-center transition hover:bg-secondary/70"
              aria-label="Minimize window"
            >
              <Minus className="h-4 w-4" />
            </button>
            <button
              onClick={() => {
                void toggleMaximizeWindow();
              }}
              className="flex h-9 w-12 items-center justify-center transition hover:bg-secondary/70"
              aria-label={windowMaximized ? "Restore window" : "Maximize window"}
            >
              {windowMaximized ? <Copy className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />}
            </button>
            <button
              onClick={() => {
                void requestWindowClose();
              }}
              className="flex h-9 w-12 items-center justify-center transition hover:bg-white hover:text-black"
              aria-label="Close window"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border bg-card/80 px-3 py-2 backdrop-blur sm:px-4">
          <div className="flex min-w-0 items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => setSidebarOpen(true)} className="lg:hidden">
              <Menu className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto">
            <Button variant="ghost" onClick={() => setSettingsOpen(true)} className="flex-1 sm:flex-none">
              <SettingsIcon className="mr-2 h-4 w-4" />
              Settings
            </Button>
            <Button variant="secondary" onClick={openFileDialog} className="flex-1 sm:flex-none">
              <FileText className="mr-2 h-4 w-4" />
              Open File
            </Button>
            <Button variant="secondary" onClick={newTab} className="flex-1 sm:flex-none">
              <FileText className="mr-2 h-4 w-4" />
              New Tab
            </Button>
            <Button onClick={saveActiveTab} disabled={saving} className="flex-1 sm:flex-none">
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save
            </Button>
            <Button variant="ghost" onClick={saveActiveTabAs} className="flex-1 sm:flex-none">
              Save As
            </Button>
          </div>
        </header>

        {sidebarOpen ? (
          <button
            aria-label="Close sidebar overlay"
            className="fixed inset-0 z-20 bg-black/60 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        ) : null}

        {settingsOpen ? (
          <button
            aria-label="Close settings overlay"
            className="fixed inset-0 z-20 bg-black/60 xl:hidden"
            onClick={() => setSettingsOpen(false)}
          />
        ) : null}

        {pendingClose ? (
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 px-4">
            <Card className="w-full max-w-md space-y-4 p-5">
              <div>
                <p className="text-base font-semibold">
                  {pendingClose.mode === "app" ? "Close app with unsaved changes?" : "Close unsaved tab?"}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {pendingClose.mode === "app"
                    ? "One or more tabs have unsaved changes."
                    : `${pendingClose.title ?? "This tab"} has unsaved changes.`}
                </p>
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <Button variant="ghost" onClick={() => void resolvePendingClose("cancel")}>
                  Cancel
                </Button>
                <Button variant="secondary" onClick={() => void resolvePendingClose("discard")}>
                  Don't Save
                </Button>
                <Button onClick={() => void resolvePendingClose("save")}>Save</Button>
              </div>
            </Card>
          </div>
        ) : null}

        <div
          className={cn(
            "grid min-h-0 h-full overflow-hidden",
            settingsOpen
              ? sidebarCollapsed
                ? "lg:grid-cols-[80px_minmax(0,1fr)] xl:grid-cols-[80px_minmax(0,1fr)_360px]"
                : "lg:grid-cols-[280px_minmax(0,1fr)] xl:grid-cols-[280px_minmax(0,1fr)_360px]"
              : sidebarCollapsed
                ? "lg:grid-cols-[80px_minmax(0,1fr)]"
                : "lg:grid-cols-[280px_minmax(0,1fr)]"
          )}
        >
          <aside
            className={cn(
              "fixed inset-y-0 left-0 z-30 flex min-h-0 flex-col border-r border-border bg-card transition-[width,transform] duration-500 ease-in-out lg:static lg:z-0 lg:w-auto h-full overflow-hidden",
              sidebarCollapsed ? "w-[80px]" : "w-[280px]",
              sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
            )}
          >
            <button
              onClick={() => setSidebarCollapsed((current) => !current)}
              className="absolute -right-4 top-6 z-10 hidden h-8 w-8 items-center justify-center rounded-full border border-border bg-background text-foreground shadow-soft transition duration-300 ease-in-out hover:bg-secondary/70 lg:inline-flex"
              aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {sidebarCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            </button>

            <div className="border-b border-border p-3">
              <div className="mb-3 flex items-center justify-between">
                <p
                  className={cn(
                    "text-sm font-medium transition-all duration-300 ease-in-out",
                    sidebarCollapsed ? "pointer-events-none -translate-x-2 opacity-0" : "translate-x-0 opacity-100"
                  )}
                >
                  Workspace
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setSidebarOpen(false)}
                    className="rounded-xl border border-border p-2 transition hover:bg-secondary/70 lg:hidden"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {sidebarCollapsed ? (
                <div className="hidden lg:flex lg:justify-center">
                  <button
                    onClick={() => setSidebarCollapsed(false)}
                    className="rounded-xl border border-border bg-background p-3 transition duration-300 ease-in-out hover:bg-secondary/70"
                    aria-label="Expand sidebar"
                  >
                    <Search className="h-4 w-4 text-muted-foreground" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 transition-all duration-300 ease-in-out">
                  <Search className="h-4 w-4 text-muted-foreground" />
                  <Input
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    placeholder="Search files"
                    className="border-0 bg-transparent px-0 focus-visible:ring-0"
                  />
                </div>
              )}
            </div>

            {sidebarCollapsed ? (
              <div className="hidden border-b border-border py-2 lg:block" />
            ) : (
              <div className="flex items-center justify-between border-b border-border px-3 py-2 text-xs uppercase tracking-[0.24em] text-muted-foreground transition-all duration-300 ease-in-out">
                <span className="truncate">{workspacePath ?? "Workspace"}</span>
                <button onClick={refreshWorkspace} className="text-foreground transition hover:opacity-70">
                  Refresh
                </button>
              </div>
            )}

            <div className="min-h-0 flex-1 overflow-auto p-2">
              {!sidebarCollapsed && recentFiles.length > 0 ? (
                <div className="mb-4">
                  <div className="mb-2 flex items-center justify-between px-1 text-xs uppercase tracking-[0.24em] text-muted-foreground">
                    <span>Recent</span>
                    <button
                      onClick={clearRecentFiles}
                      className="text-[10px] lowercase tracking-normal text-muted-foreground transition hover:text-foreground"
                    >
                      clear
                    </button>
                  </div>
                  <div className="space-y-1">
                    {recentFiles.map((file) => (
                      <button
                        key={file.path}
                        onClick={() => {
                          void openFile(file.path);
                        }}
                        className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm transition duration-200 ease-out hover:bg-secondary/80 hover:text-foreground"
                      >
                        <FileText className="h-4 w-4 opacity-60" />
                        <span className="truncate">{file.title}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {filteredEntries.length === 0 ? (
                sidebarCollapsed ? (
                  <div className="hidden lg:flex lg:justify-center">
                    <div className="rounded-xl border border-dashed border-border p-3 text-muted-foreground">
                      <FolderOpen className="h-4 w-4" />
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                    Open a folder to browse files.
                  </div>
                )
              ) : (
                <div className="space-y-1 transition-all duration-300 ease-in-out">
                  {filteredEntries.map((entry) => (
                    <button
                      key={entry.path}
                      onClick={() => {
                        if (entry.isDirectory) {
                          void openWorkspaceDirectory(entry.path);
                        } else {
                          void openFile(entry.path);
                        }
                      }}
                      className={cn(
                        "flex w-full items-center rounded-xl text-left text-sm transition duration-200 ease-out",
                        sidebarCollapsed ? "justify-center px-2 py-3" : "gap-2 px-3 py-2",
                        entry.isDirectory
                          ? "cursor-default text-muted-foreground"
                          : "hover:bg-secondary/80 hover:text-foreground"
                      )}
                      aria-label={entry.name}
                      title={entry.name}
                    >
                      {entry.isDirectory ? (
                        <FolderOpen className="h-4 w-4 opacity-60" />
                      ) : (
                        <FileText className="h-4 w-4 opacity-60" />
                      )}
                      <span
                        className={cn(
                          "truncate transition-all duration-300 ease-in-out",
                          sidebarCollapsed ? "max-w-0 -translate-x-2 opacity-0" : "max-w-[180px] translate-x-0 opacity-100"
                        )}
                      >
                        {entry.name}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </aside>

          <main className="grid min-h-0 h-full grid-rows-[auto_auto_auto_1fr] bg-background lg:min-w-0 overflow-hidden">
            <div className="flex shrink-0 gap-2 overflow-x-auto border-b border-border px-3 py-2">
              {tabs.map((tab) => (
                <div
                  key={tab.id}
                  className={cn(
                    "flex min-w-[180px] items-center gap-2 rounded-xl border px-3 py-2 text-sm transition",
                    tab.id === activeTabId
                      ? "border-foreground bg-foreground text-background"
                      : "border-border bg-card text-foreground hover:bg-secondary/70"
                  )}
                >
                  <button
                    onClick={() => setActiveTabId(tab.id)}
                    className="flex min-w-0 flex-1 items-center justify-between gap-3 text-left"
                  >
                    <span className="truncate">{tab.title}</span>
                    {tab.dirty ? <span className="h-2 w-2 rounded-full bg-current" /> : null}
                  </button>
                  <button
                    onClick={() => requestCloseTab(tab.id)}
                    aria-label={`Close ${tab.title}`}
                    className={cn(
                      "rounded-lg p-1 transition",
                      tab.id === activeTabId ? "hover:bg-black/15" : "hover:bg-secondary"
                    )}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>

            <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-3 py-2">
              <FormattingButton label="H1" onClick={() => applyFormatting((editor) => editor.insertPrefix("# "))} />
              <FormattingButton label="Bold" onClick={() => applyFormatting((editor) => editor.wrapSelection("**"))} />
              <FormattingButton label="Italic" onClick={() => applyFormatting((editor) => editor.wrapSelection("*"))} />
              <FormattingButton label="Link" onClick={() => applyFormatting((editor) => editor.wrapSelection("[", "](url)"))} />
              <FormattingButton label="Code" onClick={() => applyFormatting((editor) => editor.wrapSelection("`"))} />
              <FormattingButton label="List" onClick={() => applyFormatting((editor) => editor.insertPrefix("- "))} />
              <FormattingButton label="Task" onClick={() => applyFormatting((editor) => editor.insertPrefix("- [ ] "))} />
              <FormattingButton label="Quote" onClick={() => applyFormatting((editor) => editor.insertPrefix("> "))} />
            </div>

            {findState.isFindOpen ? (
              <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-3 py-2">
                <Input
                  ref={findInputRef}
                  value={findState.findQuery}
                  onChange={(event) =>
                    setFindState((current) => ({
                      ...current,
                      findQuery: event.target.value,
                      activeMatchIndex: 0,
                    }))
                  }
                  placeholder="Find"
                  className="w-full sm:w-56"
                />
                {findState.isReplaceOpen ? (
                  <Input
                    ref={replaceInputRef}
                    value={findState.replaceQuery}
                    onChange={(event) =>
                      setFindState((current) => ({
                        ...current,
                        replaceQuery: event.target.value,
                      }))
                    }
                    placeholder="Replace"
                    className="w-full sm:w-56"
                  />
                ) : null}
                <Button variant="secondary" size="sm" onClick={goToPreviousMatch}>
                  Prev
                </Button>
                <Button variant="secondary" size="sm" onClick={goToNextMatch}>
                  Next
                </Button>
                {findState.isReplaceOpen ? (
                  <>
                    <Button variant="secondary" size="sm" onClick={replaceCurrentMatch}>
                      Replace
                    </Button>
                    <Button variant="secondary" size="sm" onClick={replaceAllMatches}>
                      Replace All
                    </Button>
                  </>
                ) : null}
                <span className="text-xs text-muted-foreground">
                  {findState.matchCount === 0
                    ? "No matches"
                    : `${Math.min(findState.activeMatchIndex + 1, findState.matchCount)} / ${findState.matchCount}`}
                </span>
                <Button variant="ghost" size="sm" onClick={closeFindBar}>
                  Close
                </Button>
              </div>
            ) : null}

            <div
              className={cn(
                "grid min-h-0 h-full overflow-hidden",
                preferences.showPreview
                  ? "grid-cols-1 grid-rows-[1fr_1fr] lg:grid-cols-2 lg:grid-rows-none"
                  : "grid-cols-1"
              )}
            >
              <section
                className={cn(
                  "min-h-0 h-full overflow-hidden",
                  preferences.showPreview ? "lg:border-r lg:border-border" : ""
                )}
              >
                <MarkdownEditor
                  ref={editorRef}
                  tabId={activeTab?.id ?? ""}
                  revision={activeTab?.revision ?? 0}
                  value={activeTab?.content ?? ""}
                  onChange={updateActiveTabContent}
                  wordWrap={preferences.wordWrap}
                />
              </section>
              {preferences.showPreview ? (
                <section className="min-h-0 h-full overflow-auto border-t border-border bg-card/30 p-4 lg:border-t-0">
                  <Card className="markdown-preview max-w-none border-border bg-background p-6 text-foreground">
                    <MarkdownPreview content={activeTab?.content ?? ""} />
                  </Card>
                </section>
              ) : null}
            </div>
          </main>

          {settingsOpen ? (
            <aside
              className={cn(
                "fixed inset-y-0 right-0 z-30 flex w-full min-h-0 max-w-[360px] flex-col border-l border-border bg-card transition-transform sm:w-[360px] xl:static xl:z-0 xl:w-auto h-full overflow-hidden",
                settingsOpen ? "translate-x-0" : "translate-x-full"
              )}
            >
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <div>
                  <p className="text-sm font-medium">Preferences</p>
                  <p className="text-xs text-muted-foreground">Settings and app details</p>
                </div>
                <button
                  onClick={() => setSettingsOpen(false)}
                  className="rounded-xl border border-border p-2 transition hover:bg-secondary/70"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="grid grid-cols-2 border-b border-border p-2">
                <button
                  onClick={() => setSettingsSection("settings")}
                  className={cn(
                    "flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm transition",
                    settingsSection === "settings"
                      ? "bg-foreground text-background"
                      : "text-foreground hover:bg-secondary/70"
                  )}
                >
                  <SettingsIcon className="h-4 w-4" />
                  Settings
                </button>
                <button
                  onClick={() => setSettingsSection("about")}
                  className={cn(
                    "flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm transition",
                    settingsSection === "about"
                      ? "bg-foreground text-background"
                      : "text-foreground hover:bg-secondary/70"
                  )}
                >
                  <Info className="h-4 w-4" />
                  About
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-auto p-4">
                {settingsSection === "settings" ? (
                  <div className="space-y-4">
                    <SettingsRow
                      title="Live preview"
                      description="Show the rendered markdown preview beside the editor."
                      checked={preferences.showPreview}
                      onToggle={() => updatePreferences({ showPreview: !preferences.showPreview })}
                    />
                    <SettingsRow
                      title="Word wrap"
                      description="Wrap long lines inside the markdown editor."
                      checked={preferences.wordWrap}
                      onToggle={() => updatePreferences({ wordWrap: !preferences.wordWrap })}
                    />
                    <SettingsRow
                      title="Invert theme"
                      description="Flip the monochrome palette between dark and light."
                      checked={preferences.invertTheme}
                      onToggle={() => updatePreferences({ invertTheme: !preferences.invertTheme })}
                    />
                    <Card className="space-y-3 p-4">
                      <div>
                        <p className="text-sm font-medium">Updates</p>
                        <p className="text-xs text-muted-foreground">
                          GitHub release updates are enabled for packaged builds.
                        </p>
                      </div>
                      <Button
                        variant="secondary"
                        onClick={() => {
                          void checkForUpdates();
                        }}
                        disabled={updateState.status === "checking"}
                      >
                        {updateState.status === "checking" ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Sparkles className="mr-2 h-4 w-4" />
                        )}
                        Check for Updates
                      </Button>
                      {updateState.downloaded ? (
                        <Button
                          onClick={() => {
                            void installUpdate();
                          }}
                        >
                          Restart to Install Update
                        </Button>
                      ) : null}
                      <p className="text-xs text-muted-foreground">{updateState.message}</p>
                    </Card>
                    <Card className="space-y-3 p-4">
                      <div>
                        <p className="text-sm font-medium">Recent Files</p>
                        <p className="text-xs text-muted-foreground">
                          Clear search and quick access history of recently opened files.
                        </p>
                      </div>
                      <Button
                        variant="secondary"
                        onClick={clearRecentFiles}
                        disabled={recentFiles.length === 0}
                        className="w-full"
                      >
                        Clear Recent Files
                      </Button>
                    </Card>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <Card className="space-y-4 p-4">
                      <div className="flex items-center gap-3">
                        <img src="/icon.svg" alt="Esy Text Editor" className="h-12 w-12 rounded-2xl border border-border" />
                        <div>
                          <p className="text-base font-semibold">{appInfo.name}</p>
                          <p className="text-sm text-muted-foreground">Version {appInfo.version}</p>
                        </div>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Minimal markdown workspace built with React, Tailwind CSS, and Electron.
                      </p>
                    </Card>
                    <Card className="space-y-2 p-4 text-sm text-muted-foreground">
                      <p>Author: Rajjit Laishram</p>
                      <p>Platform: {appInfo.platform}</p>
                      <p>Mode: {appInfo.packaged ? "Packaged app" : "Development preview"}</p>
                    </Card>
                  </div>
                )}
              </div>
            </aside>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function SettingsRow({
  title,
  description,
  checked,
  onToggle,
}: {
  title: string;
  description: string;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <Card className="flex items-center justify-between gap-4 p-4">
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <button
        onClick={onToggle}
        className={cn(
          "relative h-7 w-12 rounded-full border transition",
          checked ? "border-foreground bg-foreground" : "border-border bg-background"
        )}
      >
        <span
          className={cn(
            "absolute top-1 h-5 w-5 rounded-full transition",
            checked ? "left-6 bg-background" : "left-1 bg-foreground"
          )}
        />
      </button>
    </Card>
  );
}

function FormattingButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <Button variant="ghost" size="sm" onClick={onClick} className="rounded-full">
      {label}
    </Button>
  );
}

const lineWrappingCompartment = new Compartment();

const MarkdownEditor = React.forwardRef<
  EditorHandle,
  {
    tabId: string;
    revision: number;
    value: string;
    onChange: (value: string) => void;
    wordWrap: boolean;
  }
>(function MarkdownEditor({ tabId, revision, value, onChange, wordWrap }, ref) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const currentValue = useRef(value);
  const syncingEditorRef = useRef(false);
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const lastTabIdRef = useRef<string | null>(null);
  const lastRevisionRef = useRef<number>(-1);

  useEffect(() => {
    if (tabId !== lastTabIdRef.current || revision !== lastRevisionRef.current) {
      lastTabIdRef.current = tabId;
      lastRevisionRef.current = revision;

      if (viewRef.current) {
        currentValue.current = value;
        syncingEditorRef.current = true;
        viewRef.current.dispatch({
          changes: { from: 0, to: viewRef.current.state.doc.length, insert: value },
        });
        queueMicrotask(() => {
          syncingEditorRef.current = false;
        });
      }
    }
  }, [tabId, revision, value]);

  useEffect(() => {
    if (viewRef.current) {
      viewRef.current.dispatch({
        effects: lineWrappingCompartment.reconfigure(
          wordWrap ? EditorView.lineWrapping : []
        ),
      });
    }
  }, [wordWrap]);

  useEffect(() => {
    if (!hostRef.current) {
      return;
    }

    const state = EditorState.create({
      doc: currentValue.current,
      extensions: [
        markdown({ base: markdownLanguage }),
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightActiveLine(),
        drawSelection(),
        lineWrappingCompartment.of(wordWrap ? EditorView.lineWrapping : []),
        keymap.of([]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged && !syncingEditorRef.current) {
            const nextValue = update.state.doc.toString();
            currentValue.current = nextValue;
            onChangeRef.current(nextValue);
          }
        }),
        EditorView.theme({
          "&": {
            height: "100%",
            backgroundColor: "hsl(var(--background))",
            color: "hsl(var(--foreground))",
            caretColor: "hsl(var(--foreground))",
          },
          ".cm-scroller": {
            fontFamily: '"SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace',
            fontSize: "14px",
            lineHeight: "1.65",
          },
          ".cm-content": {
            padding: "20px",
            minHeight: "100%",
          },
          ".cm-gutters": {
            backgroundColor: "hsl(var(--background))",
            color: "hsl(var(--muted-foreground))",
            borderRight: "1px solid hsl(var(--border))",
          },
          ".cm-activeLineGutter": {
            backgroundColor: "transparent",
            color: "hsl(var(--foreground))",
          },
          ".cm-activeLine": {
            backgroundColor: "rgba(255,255,255,0.03)",
          },
          ".cm-focused": {
            outline: "none",
          },
          "&.cm-focused .cm-cursor, .cm-dropCursor": {
            borderLeftColor: "hsl(var(--foreground))",
            borderLeftWidth: "2px",
          },
          ".cm-selectionBackground, ::selection": {
            backgroundColor: "rgba(255,255,255,0.2)",
          },
        }),
      ],
    });

    const view = new EditorView({
      state,
      parent: hostRef.current,
    });

    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, []);

  React.useImperativeHandle(ref, () => ({
    getValue: () => currentValue.current,
    setValue: (nextValue: string) => {
      const view = viewRef.current;
      if (!view) {
        return;
      }

      currentValue.current = nextValue;
      syncingEditorRef.current = true;
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: nextValue },
      });
      queueMicrotask(() => {
        syncingEditorRef.current = false;
      });
    },
    focus: () => {
      viewRef.current?.focus();
    },
    wrapSelection: (before: string, after = before) => {
      const view = viewRef.current;
      if (!view) {
        return;
      }

      const selection = view.state.selection.main;
      const selectedText = view.state.sliceDoc(selection.from, selection.to);
      const nextValue = `${before}${selectedText}${after}`;
      view.dispatch({
        changes: { from: selection.from, to: selection.to, insert: nextValue },
        selection: {
          anchor: selection.from + before.length + selectedText.length,
        },
      });
      view.focus();
    },
    insertPrefix: (prefix: string) => {
      const view = viewRef.current;
      if (!view) {
        return;
      }

      const selection = view.state.selection.main;
      const line = view.state.doc.lineAt(selection.from);
      view.dispatch({
        changes: { from: line.from, to: line.from, insert: prefix },
        selection: {
          anchor: selection.anchor + prefix.length,
        },
      });
      view.focus();
    },
    setSelection: (from: number, to: number) => {
      const view = viewRef.current;
      if (!view) {
        return;
      }

      view.dispatch({
        selection: EditorSelection.single(from, to),
        scrollIntoView: true,
      });
    },
    getSelectionRange: () => {
      const view = viewRef.current;
      if (!view) {
        return { from: 0, to: 0 };
      }

      const selection = view.state.selection.main;
      return {
        from: selection.from,
        to: selection.to,
      };
    },
    replaceRange: (from: number, to: number, insert: string, selectInserted = false) => {
      const view = viewRef.current;
      if (!view) {
        return;
      }

      view.dispatch({
        changes: { from, to, insert },
        selection: selectInserted
          ? EditorSelection.single(from, from + insert.length)
          : EditorSelection.single(from + insert.length),
        scrollIntoView: true,
      });
      view.focus();
    },
  }));

  return <div ref={hostRef} className="h-full min-h-[320px]" />;
});

const MarkdownPreview = React.memo(function MarkdownPreview({ content }: { content: string }) {
  const [debouncedContent, setDebouncedContent] = useState(content);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedContent(content);
    }, 150);

    return () => {
      clearTimeout(handler);
    };
  }, [content]);

  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]}>
      {debouncedContent}
    </ReactMarkdown>
  );
});

export default App;
