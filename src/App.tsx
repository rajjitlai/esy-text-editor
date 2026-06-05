import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  FileText,
  FolderOpen,
  Info,
  Loader2,
  Menu,
  Save,
  Search,
  Settings as SettingsIcon,
  Sparkles,
  X,
} from "lucide-react";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
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
};

type AppInfo = {
  name: string;
  version: string;
  platform: string;
  packaged: boolean;
};

type UpdateState = {
  status: "idle" | "checking" | "available" | "unavailable" | "error";
  message: string;
};

type Preferences = {
  showPreview: boolean;
  wordWrap: boolean;
};

type PendingCloseState = {
  tabId: string;
  title: string;
};

type EditorHandle = {
  getValue: () => string;
  setValue: (nextValue: string) => void;
  focus: () => void;
  wrapSelection: (before: string, after?: string) => void;
  insertPrefix: (prefix: string) => void;
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

function createEmptyDocument(): DocumentTab {
  return {
    id: crypto.randomUUID(),
    title: "Untitled",
    content: defaultContent,
    dirty: false,
  };
}

function loadPreferences(): Preferences {
  if (typeof window === "undefined") {
    return { showPreview: true, wordWrap: true };
  }

  try {
    const raw = window.localStorage.getItem(preferencesStorageKey);
    if (!raw) {
      return { showPreview: true, wordWrap: true };
    }

    const parsed = JSON.parse(raw) as Partial<Preferences>;
    return {
      showPreview: parsed.showPreview ?? true,
      wordWrap: parsed.wordWrap ?? true,
    };
  } catch {
    return { showPreview: true, wordWrap: true };
  }
}

function App() {
  const [workspacePath, setWorkspacePath] = useState<string | null>(null);
  const [workspaceEntries, setWorkspaceEntries] = useState<WorkspaceEntry[]>([]);
  const [tabs, setTabs] = useState<DocumentTab[]>([createEmptyDocument()]);
  const [activeTabId, setActiveTabId] = useState<string>(tabs[0].id);
  const [searchTerm, setSearchTerm] = useState("");
  const [saving, setSaving] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
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
  });
  const [preferences, setPreferences] = useState<Preferences>(() => loadPreferences());
  const [pendingClose, setPendingClose] = useState<PendingCloseState | null>(null);
  const editorRef = useRef<EditorHandle | null>(null);

  const activeTab = useMemo(
    () => tabs.find((tab) => tab.id === activeTabId) ?? tabs[0],
    [tabs, activeTabId]
  );

  useEffect(() => {
    const current = tabs.find((tab) => tab.id === activeTabId);
    if (current && editorRef.current?.getValue() !== current.content) {
      editorRef.current?.setValue(current.content);
    }
  }, [activeTabId, tabs]);

  useEffect(() => {
    editorBridge
      .getAppInfo()
      .then(setAppInfo)
      .catch(() => {
        setUpdateState({
          status: "error",
          message: "Unable to load app metadata.",
        });
      });
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(preferencesStorageKey, JSON.stringify(preferences));
    }
  }, [preferences]);

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
            ? { ...tab, content: result.content, dirty: false, title: existing.title }
            : tab
        )
      );
      setActiveTabId(existing.id);
      setSidebarOpen(false);
      return;
    }

    const newTab: DocumentTab = {
      id: crypto.randomUUID(),
      title: path.split(/[\\/]/).pop() ?? "Untitled",
      path,
      content: result.content,
      dirty: false,
    };

    setTabs((currentTabs) => [...currentTabs, newTab]);
    setActiveTabId(newTab.id);
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

  async function saveActiveTab() {
    const currentTab = tabs.find((tab) => tab.id === activeTabId);
    if (!currentTab) {
      return;
    }

    setSaving(true);
    try {
      const content = editorRef.current?.getValue() ?? currentTab.content;
      const targetPath =
        currentTab.path ?? (await editorBridge.saveFile(currentTab.title))?.path ?? null;

      if (!targetPath) {
        return;
      }

      await editorBridge.writeFile(targetPath, content);
      setTabs((currentTabs) =>
        currentTabs.map((tab) =>
          tab.id === currentTab.id
            ? {
                ...tab,
                path: targetPath,
                title: targetPath.split(/[\\/]/).pop() ?? tab.title,
                dirty: false,
                content,
              }
            : tab
        )
      );
    } finally {
      setSaving(false);
    }
  }

  async function saveActiveTabAs() {
    const currentTab = tabs.find((tab) => tab.id === activeTabId);
    if (!currentTab) {
      return;
    }

    const content = editorRef.current?.getValue() ?? currentTab.content;
    const result = await editorBridge.saveFile(currentTab.path ?? currentTab.title);
    if (!result) {
      return;
    }

    await editorBridge.writeFile(result.path, content);
    setTabs((currentTabs) =>
      currentTabs.map((tab) =>
        tab.id === currentTab.id
          ? {
              ...tab,
              path: result.path,
              title: result.path.split(/[\\/]/).pop() ?? tab.title,
              dirty: false,
              content,
            }
          : tab
      )
    );
  }

  async function checkForUpdates() {
    setUpdateState({
      status: "checking",
      message: "Checking for updates...",
    });

    try {
      const result = await editorBridge.checkForUpdates();
      setUpdateState(result);
    } catch {
      setUpdateState({
        status: "error",
        message: "Update check failed.",
      });
    }
  }

  function newTab() {
    const tab = createEmptyDocument();
    setTabs((currentTabs) => [...currentTabs, tab]);
    setActiveTabId(tab.id);
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
        const fallbackTab =
          remainingTabs[index] ?? remainingTabs[index - 1] ?? nextTabs[0];
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
        tabId: targetTab.id,
        title: targetTab.title,
      });
      return;
    }

    closeTab(tabId);
  }

  function confirmCloseTab() {
    if (!pendingClose) {
      return;
    }

    closeTab(pendingClose.tabId);
    setPendingClose(null);
  }

  function updatePreferences(next: Partial<Preferences>) {
    setPreferences((current) => ({ ...current, ...next }));
  }

  const filteredEntries = workspaceEntries.filter((entry) =>
    entry.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="grid min-h-screen grid-rows-[auto_1fr]">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-card/80 px-3 py-3 backdrop-blur sm:px-4">
          <div className="flex min-w-0 items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => setSidebarOpen(true)} className="lg:hidden">
              <Menu className="h-4 w-4" />
            </Button>
            <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl border border-border bg-background">
              <img src="/icon.svg" alt="Esy Text Editor" className="h-full w-full object-cover" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium tracking-wide">Esy Text Editor</p>
              <p className="truncate text-xs text-muted-foreground">
                Minimal markdown workspace in Electron
              </p>
            </div>
          </div>
          <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto">
            <Button variant="ghost" onClick={() => setSettingsOpen(true)} className="flex-1 sm:flex-none">
              <SettingsIcon className="mr-2 h-4 w-4" />
              Settings
            </Button>
            <Button variant="secondary" onClick={openFolder} className="flex-1 sm:flex-none">
              <FolderOpen className="mr-2 h-4 w-4" />
              Open Folder
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
              {saving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
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
                <p className="text-base font-semibold">Discard unsaved changes?</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">{pendingClose.title}</span> has unsaved changes.
                  Closing it now will lose those edits.
                </p>
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <Button variant="ghost" onClick={() => setPendingClose(null)}>
                  Cancel
                </Button>
                <Button variant="secondary" onClick={confirmCloseTab}>
                  Close Tab
                </Button>
              </div>
            </Card>
          </div>
        ) : null}

        <div
          className={cn(
            "grid min-h-0",
            settingsOpen
              ? "lg:grid-cols-[280px_minmax(0,1fr)] xl:grid-cols-[280px_minmax(0,1fr)_360px]"
              : "lg:grid-cols-[280px_minmax(0,1fr)]"
          )}
        >
          <aside
            className={cn(
              "fixed inset-y-0 left-0 z-30 flex w-[280px] min-h-0 flex-col border-r border-border bg-card transition-transform lg:static lg:z-0 lg:w-auto",
              sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
            )}
          >
            <div className="border-b border-border p-3">
              <div className="mb-3 flex items-center justify-between lg:hidden">
                <p className="text-sm font-medium">Workspace</p>
                <button
                  onClick={() => setSidebarOpen(false)}
                  className="rounded-xl border border-border p-2 transition hover:bg-secondary/70"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="flex items-center gap-2 rounded-xl border border-border bg-background px-3">
                <Search className="h-4 w-4 text-muted-foreground" />
                <Input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Search files"
                  className="border-0 bg-transparent px-0 focus-visible:ring-0"
                />
              </div>
            </div>
            <div className="flex items-center justify-between border-b border-border px-3 py-2 text-xs uppercase tracking-[0.24em] text-muted-foreground">
              <span className="truncate">{workspacePath ?? "Workspace"}</span>
              <button onClick={refreshWorkspace} className="text-foreground transition hover:opacity-70">
                Refresh
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-auto p-2">
              {filteredEntries.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                  Open a folder to browse files.
                </div>
              ) : (
                <div className="space-y-1">
                  {filteredEntries.map((entry) => (
                    <button
                      key={entry.path}
                      onClick={() => {
                        if (entry.isDirectory) {
                          openWorkspaceDirectory(entry.path);
                        } else {
                          openFile(entry.path);
                        }
                      }}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm transition",
                        entry.isDirectory
                          ? "cursor-default text-muted-foreground"
                          : "hover:bg-secondary/80 hover:text-foreground"
                      )}
                    >
                      <Sparkles className="h-4 w-4 opacity-60" />
                      <span className="truncate">{entry.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </aside>

          <main className="grid min-h-0 grid-rows-[auto_auto_1fr] bg-background lg:min-w-0">
            <div className="flex gap-2 overflow-x-auto border-b border-border px-3 py-2">
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
                      "rounded-lg p-1 transition hover:bg-black/10",
                      tab.id === activeTabId
                        ? "hover:bg-black/15"
                        : "hover:bg-secondary"
                    )}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
              <FormattingButton label="H1" onClick={() => applyFormatting((editor) => editor.insertPrefix("# "))} />
              <FormattingButton label="Bold" onClick={() => applyFormatting((editor) => editor.wrapSelection("**"))} />
              <FormattingButton label="Italic" onClick={() => applyFormatting((editor) => editor.wrapSelection("*"))} />
              <FormattingButton label="Link" onClick={() => applyFormatting((editor) => editor.wrapSelection("[", "](url)"))} />
              <FormattingButton label="Code" onClick={() => applyFormatting((editor) => editor.wrapSelection("`"))} />
              <FormattingButton label="List" onClick={() => applyFormatting((editor) => editor.insertPrefix("- "))} />
              <FormattingButton label="Task" onClick={() => applyFormatting((editor) => editor.insertPrefix("- [ ] "))} />
              <FormattingButton label="Quote" onClick={() => applyFormatting((editor) => editor.insertPrefix("> "))} />
            </div>

            <div
              className={cn(
                "grid min-h-0",
                preferences.showPreview ? "grid-cols-1 2xl:grid-cols-2" : "grid-cols-1"
              )}
            >
              <section
                className={cn(
                  "min-h-0",
                  preferences.showPreview ? "2xl:border-r 2xl:border-border" : ""
                )}
              >
                <MarkdownEditor
                  ref={editorRef}
                  value={activeTab?.content ?? ""}
                  onChange={updateActiveTabContent}
                  wordWrap={preferences.wordWrap}
                />
              </section>
              {preferences.showPreview ? (
                <section className="min-h-0 overflow-auto border-t border-border bg-card/30 p-4 2xl:border-t-0">
                  <Card className="markdown-preview max-w-none border-border bg-background p-6 text-foreground">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {activeTab?.content ?? ""}
                    </ReactMarkdown>
                  </Card>
                </section>
              ) : null}
            </div>
          </main>

          {settingsOpen ? (
            <aside
              className={cn(
                "fixed inset-y-0 right-0 z-30 flex w-full min-h-0 max-w-[360px] flex-col border-l border-border bg-card transition-transform sm:w-[360px] xl:static xl:z-0 xl:w-auto",
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
                    <Card className="space-y-3 p-4">
                      <div>
                        <p className="text-sm font-medium">Updates</p>
                        <p className="text-xs text-muted-foreground">
                          Manual update checks are wired. Automatic updates are not.
                        </p>
                      </div>
                      <Button
                        variant="secondary"
                        onClick={checkForUpdates}
                        disabled={updateState.status === "checking"}
                      >
                        {updateState.status === "checking" ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Sparkles className="mr-2 h-4 w-4" />
                        )}
                        Check for Updates
                      </Button>
                      <p className="text-xs text-muted-foreground">{updateState.message}</p>
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

const MarkdownEditor = React.forwardRef<
  EditorHandle,
  {
    value: string;
    onChange: (value: string) => void;
    wordWrap: boolean;
  }
>(function MarkdownEditor({ value, onChange, wordWrap }, ref) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const currentValue = useRef(value);
  const syncingEditorRef = useRef(false);
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    currentValue.current = value;
    if (viewRef.current && viewRef.current.state.doc.toString() !== value) {
      syncingEditorRef.current = true;
      viewRef.current.dispatch({
        changes: { from: 0, to: viewRef.current.state.doc.length, insert: value },
      });
      queueMicrotask(() => {
        syncingEditorRef.current = false;
      });
    }
  }, [value]);

  useEffect(() => {
    if (!hostRef.current) {
      return;
    }

    const state = EditorState.create({
      doc: value,
      extensions: [
        markdown({ base: markdownLanguage }),
        ...(wordWrap ? [EditorView.lineWrapping] : []),
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
          },
          ".cm-scroller": {
            fontFamily:
              '"SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace',
            fontSize: "14px",
            lineHeight: "1.65",
          },
          ".cm-content": {
            padding: "20px",
            minHeight: "100%",
          },
          ".cm-focused": {
            outline: "none",
          },
          ".cm-cursor, .cm-dropCursor": {
            borderLeftColor: "hsl(var(--foreground))",
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
  }, [wordWrap]);

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
  }));

  return <div ref={hostRef} className="h-full min-h-[320px]" />;
});

export default App;
