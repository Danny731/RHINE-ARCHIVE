import { useCallback, useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy, PDFDocumentLoadingTask } from "pdfjs-dist";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import {
  ArrowLeft,
  ArrowUpRight,
  Bookmark,
  Check,
  ChevronDown,
  Columns2,
  Download,
  FileText,
  FolderOpen,
  Highlighter,
  History,
  Keyboard,
  List,
  LoaderCircle,
  MessageSquare,
  Moon,
  MousePointer2,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  Scan,
  Search,
  Settings2,
  ShieldCheck,
  Sun,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import Reader, { Thumbnails } from "./Reader";
import OutlinePanel from "./components/OutlinePanel";
import { identifyBook } from "./book-identity";
import UpdatePanel from "./components/UpdatePanel";
import { version as appVersion } from "../package.json";
import Bookshelf from "./components/Bookshelf";
import {
  BRAND_NAME,
  BRAND_ENGLISH,
  BRAND_TITLE,
  EXPORT_PREFIX,
} from "./branding";
import { addToCollection } from "./shelf";
import { documentSignature } from "./toc/generate";
import type { TocTarget } from "./toc/types";
import {
  clampPage,
  emptyLibrary,
  initialPosition,
  mergeLibraries,
  printedPage,
  validateLibrary,
  type Book,
  type Library,
  type Mark,
  type PdfRect,
  type ToolMode,
  type ViewMode,
} from "./model";
import {
  cacheFile,
  desktop,
  exportText,
  loadLibrary,
  pickPdf,
  readPdf,
  saveLibrary,
} from "./storage";
import { cachePageSizes, loadPdf, outlineOf } from "./pdf";
import { useDocumentPool, type PasswordRequest } from "./useDocumentPool";
import WorkspaceView, {
  type WorkspaceAction,
} from "./components/WorkspaceView";
import {
  activeReaderTab,
  emptyWorkspace,
  openReaderTab,
  selectReaderTab,
  closeReaderTab,
  moveReaderTab,
  splitReaderTab,
  mergeReaderGroups,
  patchReaderTab,
  type Workspace,
  type ReaderTab,
} from "./workspace";

type SearchResult = { page: number; text: string };
type LeftTab = "outline" | "bookmarks" | "search" | "pages";
const uid = () => crypto.randomUUID();
const cleanName = (s: string) => s.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_");
function Brand() {
  return (
    <div className="brand">
      <img
        className="brand-logo"
        src="/brand/rhine-lab-mark.svg"
        alt="莱茵生命 Logo"
      />
      <div className="brand-wordmark">
        <strong>{BRAND_ENGLISH}</strong>
        <small>READ / RECORD / DISCOVER</small>
      </div>
      <span className="brand-cn">{BRAND_NAME}</span>
    </div>
  );
}

export default function App() {
  const [library, setLibrary] = useState<Library>(emptyLibrary);
  const libraryRef = useRef(library);
  libraryRef.current = library;
  const [initialized, setInitialized] = useState(false);
  const [storageError, setStorageError] = useState(false);
  const [saved, setSaved] = useState<"saving" | "saved" | "error">("saved");

  const pdfRef = useRef<PDFDocumentProxy | null>(null);
  const loadingTask = useRef<PDFDocumentLoadingTask | null>(null);
  const loadToken = useRef(0);
  const workspace = library.workspace || emptyWorkspace();
  const workspaceRef = useRef(workspace);
  workspaceRef.current = workspace;
  const activeTab = activeReaderTab(workspace);
  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;
  const bookRef = useRef<Book | undefined>(undefined);
  const selectedBook = library.books.find((b) => b.id === activeTab?.bookId);
  const otherTab = workspace.tabs.find(
    (t) =>
      t.id ===
      workspace.groups.find((g) => g.id !== workspace.activeGroupId)
        ?.activeTabId,
  );
  const openingGroup = useRef<string | undefined>(undefined);
  const [busy, setBusy] = useState("");
  const [toast, setToast] = useState("");
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const [left, setLeft] = useState(true);
  const [right, setRight] = useState(false);
  const [tab, setTab] = useState<LeftTab>("outline");
  const [tool, setTool] = useState<ToolMode>("select");
  const [jumps, setJumps] = useState<Record<string, number>>({});
  const bumpJump = (id: string) =>
    setJumps((old) => ({ ...old, [id]: (old[id] || 0) + 1 }));
  const setJump = (_change: (n: number) => number) => {
    if (activeTab) bumpJump(activeTab.id);
  };
  const tocNavigation = useRef(0);
  const history = activeTab?.history || [];
  const query = activeTab?.query || "";
  const setQuery = (query: string) => {
    if (activeTab) modifyTab(activeTab.id, (t) => ({ ...t, query }));
  };
  const [searchStates, setSearchStates] = useState<
    Record<
      string,
      {
        searching: boolean;
        done: boolean;
        progress: number;
        results: SearchResult[];
      }
    >
  >({});
  const searchState = searchStates[activeTab?.id || ""] || {
    searching: false,
    done: false,
    progress: 0,
    results: [],
  };
  const {
    searching,
    done: searchDone,
    progress: searchProgress,
    results,
  } = searchState;
  const patchSearch = (patch: Partial<typeof searchState>) => {
    const id = activeTab?.id || "";
    setSearchStates((old) => ({
      ...old,
      [id]: {
        ...(old[id] || {
          searching: false,
          done: false,
          progress: 0,
          results: [],
        }),
        ...patch,
      },
    }));
  };
  const setSearching = (searching: boolean) => patchSearch({ searching });
  const setSearchDone = (done: boolean) => patchSearch({ done });
  const setSearchProgress = (progress: number) => patchSearch({ progress });
  const setResults = (results: SearchResult[]) => patchSearch({ results });
  const [focusedMark, setFocusedMark] = useState<string | null>(null);
  const noteDraft = activeTab?.draft?.text || "";
  const setNoteDraft = (text: string) => {
    if (activeTab)
      modifyTab(activeTab.id, (t) => ({
        ...t,
        draft: text
          ? { text, page: t.draft?.page || t.position.page }
          : undefined,
      }));
  };
  const [settings, setSettings] = useState(false);
  const [missingBook, setMissingBook] = useState<Book | null>(null);
  const [installingUpdate, setInstallingUpdate] = useState(false);
  const installingUpdateRef = useRef(false);
  installingUpdateRef.current = installingUpdate;
  const [pendingOutlineWork, setPendingOutlineWork] = useState(false);
  const [outlineEditing, setOutlineEditing] = useState(false);
  const outlineEditingRef = useRef(false);
  outlineEditingRef.current = outlineEditing;
  const relinkId = useRef<string | undefined>(undefined);
  const [offsetInput, setOffsetInput] = useState("");
  const [shelfView, setShelfView] = useState("all");
  const importCollectionId = useRef<string | undefined>(undefined);
  const [dragging, setDragging] = useState(false);
  const [passwordRequests, setPasswordRequests] = useState<PasswordRequest[]>(
    [],
  );
  const passwordPrompt = passwordRequests[0] || null;
  const dismissPassword = (id: string) =>
    setPasswordRequests((old) => old.filter((p) => p.id !== id));
  const promptPassword = (request: PasswordRequest) =>
    setPasswordRequests((old) => [
      ...old.filter((p) => p.id !== request.id),
      request,
    ]);
  const setPasswordPrompt = (
    request: { update: (password: string) => void; wrong: boolean } | null,
  ) => {
    if (request)
      promptPassword({
        ...request,
        id: "opening",
        title: "新文件",
        cancel: () => {
          loadToken.current++;
          void loadingTask.current?.destroy().catch(() => {});
          loadingTask.current = null;
          setBusy("");
        },
      });
    else dismissPassword("opening");
  };
  const [password, setPassword] = useState("");
  const searchEpoch = useRef(0);
  const textCaches = useRef(new Map<string, Map<number, string>>());
  const textCache = {
    current:
      textCaches.current.get(activeTab?.bookId || "") ||
      new Map<number, string>(),
  };
  if (activeTab) textCaches.current.set(activeTab.bookId, textCache.current);
  const visibleIds = workspace.home
    ? []
    : workspace.groups.map(
        (g) => workspace.tabs.find((t) => t.id === g.activeTabId)!.bookId,
      );
  const pool = useDocumentPool(
    library,
    visibleIds,
    promptPassword,
    dismissPassword,
  );
  const activeDocument = activeTab
    ? pool.documents[activeTab.bookId]
    : undefined;
  const pdf = activeDocument?.pdf || null;
  const outline = activeDocument?.outline || [];
  const labels = activeDocument?.labels || null;
  const book =
    selectedBook && activeTab
      ? {
          ...selectedBook,
          documentSignature:
            activeDocument?.signature || selectedBook.documentSignature,
          position: activeTab.position,
          mode: activeTab.mode,
          split: !!otherTab && otherTab.bookId === activeTab.bookId,
          secondary:
            otherTab?.bookId === activeTab.bookId
              ? otherTab.position
              : selectedBook.secondary,
        }
      : undefined;
  bookRef.current = book;
  pdfRef.current = pdf;
  useEffect(() => {
    document.title =
      !workspace.home && book ? `${book.title} · ${BRAND_NAME}` : BRAND_TITLE;
  }, [book?.title, workspace.home]);
  const fileInput = useRef<HTMLInputElement>(null);
  const backupInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const input = fileInput.current;
    const cancel = () => {
      openingGroup.current = undefined;
      importCollectionId.current = undefined;
      relinkId.current = undefined;
    };
    input?.addEventListener("cancel", cancel);
    return () => input?.removeEventListener("cancel", cancel);
  }, []);
  const initOnce = useRef(false);
  useEffect(() => {
    const signatures = new Map(
      Object.entries(pool.documents).map(([id, doc]) => [id, doc.signature]),
    );
    if (
      libraryRef.current.books.some(
        (b) =>
          signatures.has(b.id) && b.documentSignature !== signatures.get(b.id),
      )
    )
      updateLibrary((l) => ({
        ...l,
        books: l.books.map((b) =>
          signatures.has(b.id)
            ? { ...b, documentSignature: signatures.get(b.id) }
            : b,
        ),
      }));
  }, [pool.documents]);
  const notify = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 4500);
  }, []);

  function updateLibrary(fn: (l: Library) => Library) {
    const next = fn(libraryRef.current);
    libraryRef.current = next;
    workspaceRef.current = next.workspace || emptyWorkspace();
    setLibrary(next);
  }
  function modifyWorkspace(fn: (w: Workspace) => Workspace) {
    updateLibrary((lib) => ({
      ...lib,
      workspace: fn(lib.workspace || emptyWorkspace()),
    }));
  }
  function modifyTab(id: string, fn: (tab: ReaderTab) => ReaderTab) {
    updateLibrary((lib) => {
      const w = lib.workspace || emptyWorkspace(),
        tab = w.tabs.find((t) => t.id === id);
      if (!tab) return lib;
      const next = fn(tab);
      return {
        ...lib,
        workspace: patchReaderTab(w, id, next),
        books: lib.books.map((b) =>
          b.id === tab.bookId
            ? { ...b, position: next.position, mode: next.mode }
            : b,
        ),
      };
    });
  }
  function updateBook(fn: (book: Book) => Book) {
    const id = activeTab?.id;
    if (!id) return;
    updateLibrary((lib) => {
      const w = lib.workspace!,
        t = w.tabs.find((tab) => tab.id === id),
        base = lib.books.find((b) => b.id === t?.bookId);
      if (!base || !t) return lib;
      const updated = fn({ ...base, position: t.position, mode: t.mode });
      return {
        ...lib,
        books: lib.books.map((b) => (b.id === base.id ? updated : b)),
        workspace: patchReaderTab(w, id, {
          position: updated.position,
          mode: updated.mode,
        }),
      };
    });
  }
  function workspaceAction(action: WorkspaceAction) {
    if (outlineEditing && action.type !== "ratio") {
      notify("请先完成或取消目录编辑/生成，再切换标签。");
      return;
    }
    const apply = (w: Workspace) =>
      action.type === "select"
        ? selectReaderTab(w, action.tabId)
        : action.type === "close"
          ? closeReaderTab(w, action.tabId)
          : action.type === "move"
            ? moveReaderTab(w, action.tabId, action.groupId, action.beforeId)
            : action.type === "split"
              ? splitReaderTab(
                  w,
                  action.tabId,
                  action.orientation,
                  action.duplicate,
                )
              : action.type === "merge"
                ? mergeReaderGroups(w)
                : action.type === "ratio"
                  ? { ...w, ratio: action.ratio }
                  : w;
    try {
      apply(workspaceRef.current);
      if (action.type !== "ratio")
        window.dispatchEvent(new Event("pagewise:flush-position"));
      modifyWorkspace(apply);
    } catch (error) {
      if (action.type === "close") {
        modifyWorkspace((old) => selectReaderTab(old, action.tabId));
        setRight(true);
      }
      notify(String(error));
    }
  }
  useEffect(() => {
    searchEpoch.current++;
    setSearchStates((old) =>
      Object.fromEntries(
        Object.entries(old).map(([id, s]) => [id, { ...s, searching: false }]),
      ),
    );
  }, [activeTab?.id]);
  useEffect(() => {
    for (const id of textCaches.current.keys())
      if (!visibleIds.includes(id)) textCaches.current.delete(id);
  }, [visibleIds.join("|")]);
  const flush = useCallback(async () => {
    if (storageError || !initialized) return;
    window.dispatchEvent(new Event("pagewise:flush-position"));
    setSaved("saving");
    try {
      await saveLibrary(libraryRef.current);
      setSaved("saved");
    } catch {
      setSaved("error");
      notify("保存失败，请导出备份后重试。");
    }
  }, [storageError, initialized, notify]);
  useEffect(() => {
    if (!initialized || storageError) return;
    setSaved("saving");
    const timer = setTimeout(() => void flush(), 250);
    return () => clearTimeout(timer);
  }, [library, initialized, storageError, flush]);
  useEffect(() => {
    const save = () => {
      void flush();
    };
    window.addEventListener("pagehide", save);
    const visibility = () => {
      if (document.visibilityState === "hidden") save();
    };
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.removeEventListener("pagehide", save);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [flush]);
  useEffect(() => {
    document.documentElement.dataset.theme = library.dark ? "dark" : "light";
  }, [library.dark]);

  async function openData(
    data: Uint8Array,
    title: string,
    path?: string,
    file?: Blob,
    source: "file" | "demo" = "file",
    expectedId?: string,
    collectionId?: string,
  ) {
    if (outlineEditingRef.current) {
      notify("请先完成或取消目录编辑/生成，再打开文件。");
      setBusy("");
      return;
    }
    if (data.byteLength > 512 * 1024 * 1024) {
      setBusy("");
      notify("当前版本支持 512 MB 以内的 PDF");
      return;
    }
    const targetGroup =
      openingGroup.current || workspaceRef.current.activeGroupId || uid();
    openingGroup.current = undefined;
    const token = ++loadToken.current;
    tocNavigation.current++;
    setBusy("正在打开教材…");
    if (loadingTask.current)
      await loadingTask.current.destroy().catch(() => {});
    const signature = await documentSignature(data);
    if (token !== loadToken.current) return;
    const task = loadPdf(data);
    loadingTask.current = task;
    task.onPassword = (update: (p: string) => void, reason: number) => {
      if (token === loadToken.current) {
        setPasswordPrompt({ update, wrong: reason === 2 });
        setBusy("");
      }
    };
    try {
      const doc = await task.promise;
      if (token !== loadToken.current) {
        await doc.loadingTask.destroy();
        return;
      }
      const [contents, pageLabels, meta] = await Promise.all([
        outlineOf(doc).catch(() => []),
        doc.getPageLabels().catch(() => null),
        doc.getMetadata().catch(() => null),
        cachePageSizes(doc),
      ]);
      if (token !== loadToken.current) {
        await doc.loadingTask.destroy();
        return;
      }
      const fingerprint = doc.fingerprints[0] || doc.fingerprints[1];
      if (!fingerprint) throw new Error("无法识别文件指纹");
      const { id, existing } = identifyBook(
        libraryRef.current,
        fingerprint,
        signature,
        doc.numPages,
        expectedId,
      );
      const info = meta?.info as { Title?: string } | undefined;
      const name = title || info?.Title || "未命名教材";
      const next: Book = existing
        ? {
            ...existing,
            removedAt: undefined,
            documentSignature: signature,
            path: path || existing.path,
            pages: doc.numPages,
            opened: Date.now(),
            position: {
              ...existing.position,
              page: clampPage(existing.position.page, doc.numPages),
            },
            secondary: {
              ...existing.secondary,
              page: clampPage(existing.secondary.page, doc.numPages),
            },
          }
        : {
            id,
            documentSignature: signature,
            title: name.replace(/\.pdf$/i, ""),
            path,
            source,
            pages: doc.numPages,
            opened: Date.now(),
            position: initialPosition(),
            secondary: {
              ...initialPosition(),
              page: Math.min(doc.numPages, 2),
            },
            mode: "continuous",
            split: false,
            pageOffset: 0,
            bookmarks: [],
            marks: [],
          };
      // Validate the tab limit before entering React's state updater.
      openReaderTab(workspaceRef.current, next, uid(), targetGroup);
      if (file && !desktop) {
        try {
          await cacheFile(id, file);
        } catch {
          notify("已打开文件，但浏览器缓存失败；再次阅读时需要重新选择文件。");
        }
      }

      updateLibrary((l) => {
        const withBook = addToCollection(
          {
            ...l,
            books: [next, ...l.books.filter((b) => b.id !== id)],
          },
          collectionId,
          id,
        );
        return {
          ...withBook,
          workspace: openReaderTab(
            withBook.workspace || emptyWorkspace(),
            next,
            uid(),
            targetGroup,
          ),
        };
      });
      pool.register(id, {
        pdf: doc,
        outline: contents,
        labels: pageLabels,
        signature,
      });
      setTool("select");
      setRight(false);
      setTab("outline");
      setFocusedMark(null);
      setMissingBook(null);
      if (existing?.removedAt !== undefined && !collectionId)
        setShelfView("all");
      setJump((j) => j + 1);
      setPasswordPrompt(null);
      setPassword("");

      document.title = `${next.title} · ${BRAND_NAME}`;
    } catch (e) {
      await task.destroy().catch(() => {});
      if (token === loadToken.current)
        notify(
          e instanceof Error ? `打开失败：${e.message}` : "无法打开这个 PDF",
        );
    } finally {
      if (token === loadToken.current) {
        loadingTask.current = null;
        setBusy("");
        setPasswordPrompt(null);
      }
    }
  }
  async function openPath(
    path: string,
    expected?: Book,
    collectionId?: string,
  ) {
    setBusy("正在读取文件…");
    try {
      await openData(
        await readPdf(path),
        path.split(/[\\/]/).pop() || "",
        path,
        undefined,
        "file",
        expected?.id,
        collectionId,
      );
    } catch (e) {
      notify(String(e));
      if (expected) setMissingBook(expected);
      setBusy("");
    }
  }
  async function chooseFile(collectionId?: string) {
    relinkId.current = undefined;
    importCollectionId.current = collectionId;
    if (desktop) {
      try {
        const path = await pickPdf();
        importCollectionId.current = undefined;
        if (path) await openPath(path, undefined, collectionId);
        else openingGroup.current = undefined;
      } catch (e) {
        notify(String(e));
      }
    } else fileInput.current?.click();
  }
  async function openFile(
    file: File,
    expectedId?: string,
    collectionId?: string,
  ) {
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      notify("请选择 PDF 文件");
      return;
    }
    setBusy("正在读取文件…");
    try {
      await openData(
        new Uint8Array(await file.arrayBuffer()),
        file.name,
        undefined,
        file,
        "file",
        expectedId,
        collectionId,
      );
    } catch (e) {
      setBusy("");
      notify(String(e));
    }
  }
  async function demo() {
    setBusy("正在打开示例教材…");
    try {
      const response = await fetch("/sample.pdf");
      if (!response.ok) throw new Error("示例文件不可用");
      await openData(
        new Uint8Array(await response.arrayBuffer()),
        "线性代数 · 阅读体验",
        undefined,
        undefined,
        "demo",
      );
    } catch (e) {
      notify(String(e));
      setBusy("");
    }
  }
  async function reopen(b: Book) {
    if (outlineEditing) {
      notify("请先完成或取消目录编辑/生成。");
      return;
    }
    try {
      const next = openReaderTab(
        workspaceRef.current,
        b,
        uid(),
        openingGroup.current || workspaceRef.current.activeGroupId || uid(),
      );
      openingGroup.current = undefined;
      updateLibrary((l) => ({
        ...l,
        workspace: next,
        books: l.books.map((book) =>
          book.id === b.id
            ? { ...book, removedAt: undefined, opened: Date.now() }
            : book,
        ),
      }));
    } catch (error) {
      notify(String(error));
    }
  }
  async function relocateBook() {
    if (!missingBook) return;
    importCollectionId.current = undefined;
    if (desktop) {
      try {
        const path = await pickPdf();
        if (path) await openPath(path, missingBook);
      } catch (error) {
        notify(String(error));
      }
    } else {
      relinkId.current = missingBook.id;
      fileInput.current?.click();
    }
  }
  useEffect(() => {
    if (initOnce.current) return;
    initOnce.current = true;
    void loadLibrary()
      .then(async (l) => {
        libraryRef.current = l;
        setLibrary(l);
        setInitialized(true);
        if (desktop) {
          const path = await invoke<string | null>("startup_pdf");
          if (path) await openPath(path);
        }
      })
      .catch(() => {
        setStorageError(true);
        setInitialized(true);
        setSaved("error");
        notify(
          "本地书库读取失败。为保护原数据，已暂停自动保存；请先导出备份或恢复有效备份。",
        );
      });
  }, []);
  useEffect(() => {
    if (!desktop) return;
    const pending = getCurrentWebview().onDragDropEvent((event) => {
      if (event.payload.type === "over") setDragging(true);
      else if (event.payload.type === "leave") setDragging(false);
      else if (event.payload.type === "drop") {
        setDragging(false);
        const path = event.payload.paths.find((p) => /\.pdf$/i.test(p));
        if (path) void openPath(path);
        else notify("请拖入 PDF 文件");
      }
    });
    return () => {
      void pending.then((unlisten) => unlisten());
    };
  }, []);
  useEffect(() => {
    if (!desktop) return;
    const listening = listen<string>(
      "open-pdf",
      (e) => void openPath(e.payload),
    );
    return () => {
      void listening.then((off) => off());
    };
  }, []);
  useEffect(() => {
    if (!desktop) return;
    let off: (() => void) | undefined;
    void getCurrentWindow()
      .onCloseRequested(async (e) => {
        e.preventDefault();
        if (installingUpdateRef.current) return;
        window.dispatchEvent(new Event("pagewise:flush-position"));
        try {
          if (!storageError && initialized)
            await saveLibrary(libraryRef.current);
          await getCurrentWindow().destroy();
        } catch {
          notify("保存失败，暂未关闭。请先导出备份。");
        }
      })
      .then((fn) => (off = fn))
      .catch(() => notify("关闭时保存功能未能启用，请在退出前检查保存状态。"));
    return () => off?.();
  }, [storageError, initialized, notify]);

  function navigateTab(id: string, page: number, remember = true) {
    const tab = workspaceRef.current.tabs.find((t) => t.id === id);
    const book = libraryRef.current.books.find((b) => b.id === tab?.bookId);
    if (!tab || !book) return;
    modifyTab(id, (t) => ({
      ...t,
      position: { ...t.position, page: clampPage(page, book.pages), offset: 0 },
      history: remember ? [...t.history.slice(-99), t.position] : t.history,
    }));
    bumpJump(id);
  }
  function navigate(page: number, secondary = false, remember = true) {
    const target =
      secondary && otherTab?.bookId === activeTab?.bookId
        ? otherTab
        : activeTab;
    if (target) navigateTab(target.id, page, remember);
  }
  function back() {
    if (!activeTab?.history.length) return;
    modifyTab(activeTab.id, (t) => ({
      ...t,
      position: t.history.at(-1)!,
      history: t.history.slice(0, -1),
    }));
    bumpJump(activeTab.id);
  }
  async function navigateToToc(target: TocTarget, secondary: boolean) {
    const doc = pdfRef.current,
      currentBook = bookRef.current;
    const t =
      secondary && otherTab?.bookId === activeTab?.bookId
        ? otherTab
        : activeTab;
    if (!doc || !currentBook || !t) return;
    const ticket = ++tocNavigation.current;
    try {
      const page = await doc.getPage(target.page);
      const viewport = page.getViewport({
        scale: 1,
        rotation: (page.rotate + t.position.rotation) % 360,
      });
      if (
        ticket !== tocNavigation.current ||
        activeTabRef.current?.id !== activeTab?.id
      )
        return;
      const offset = target.point
        ? Math.max(
            0,
            Math.min(
              1,
              viewport.convertToViewportPoint(...target.point)[1] /
                viewport.height,
            ),
          )
        : 0;
      modifyTab(t.id, (tab) => ({
        ...tab,
        history: [...tab.history.slice(-99), tab.position],
        position: { ...tab.position, page: target.page, offset },
      }));
      bumpJump(t.id);
    } catch {
      if (ticket === tocNavigation.current)
        notify("无法定位到该目录项，请编辑目标页码。");
    }
  }
  function toggleBookmark() {
    const b = bookRef.current;
    if (!b) return;
    const existing = b.bookmarks.find((m) => m.page === b.position.page);
    updateBook((old) => ({
      ...old,
      bookmarks: existing
        ? old.bookmarks.filter((m) => m.id !== existing.id)
        : [
            ...old.bookmarks,
            {
              id: uid(),
              page: old.position.page,
              title: `第 ${printedPage(old.position.page, old.pageOffset, labels)} 页`,
            },
          ],
    }));
    notify(existing ? "已移除书签" : "已添加书签");
  }
  function addMark(
    tabId: string,
    page: number,
    rects: PdfRect[],
    quote: string,
    kind: "highlight" | "area",
  ) {
    const mark: Mark = {
      id: uid(),
      page,
      rects,
      quote,
      note: "",
      kind,
      created: Date.now(),
    };
    const target = workspaceRef.current.tabs.find((t) => t.id === tabId);
    if (!target) return;
    updateLibrary((l) => ({
      ...l,
      books: l.books.map((b) =>
        b.id === target.bookId ? { ...b, marks: [...b.marks, mark] } : b,
      ),
      workspace: selectReaderTab(l.workspace!, tabId),
    }));
    setFocusedMark(mark.id);
    setRight(true);
    if (kind === "area") setTool("select");
  }
  function addNote() {
    if (!noteDraft.trim() || !book) return;
    const m: Mark = {
      id: uid(),
      page: activeTab?.draft?.page || book.position.page,
      rects: [],
      quote: "",
      note: noteDraft.trim(),
      kind: "note",
      created: Date.now(),
    };
    updateBook((b) => ({ ...b, marks: [...b.marks, m] }));
    setNoteDraft("");
    setFocusedMark(m.id);
    notify("笔记已添加");
  }
  function focusMark(id: string) {
    setFocusedMark(id);
    setRight(true);
  }
  useEffect(() => {
    if (focusedMark && right)
      setTimeout(
        () =>
          document
            .getElementById(`mark-${focusedMark}`)
            ?.scrollIntoView({ block: "nearest", behavior: "smooth" }),
        50,
      );
  }, [focusedMark, right]);
  async function runSearch() {
    if (!pdf || !query.trim()) return;
    const epoch = ++searchEpoch.current;
    const target = pdf;
    const q = query.trim().toLocaleLowerCase();
    setResults([]);
    setSearching(true);
    setSearchDone(false);
    setSearchProgress(0);
    let found: SearchResult[] = [];
    try {
      for (let page = 1; page <= target.numPages; page++) {
        if (epoch !== searchEpoch.current) return;
        let content = textCache.current.get(page);
        if (content === undefined) {
          const p = await target.getPage(page);
          const text = await p.getTextContent();
          content = text.items
            .map((item) =>
              "str" in item
                ? item.str + ("hasEOL" in item && item.hasEOL ? "\n" : " ")
                : "",
            )
            .join("");
          if (epoch !== searchEpoch.current) return;
          textCache.current.set(page, content);
        }
        const index = content.toLocaleLowerCase().indexOf(q);
        if (index >= 0)
          found.push({
            page,
            text:
              (index > 45 ? "…" : "") +
              content.slice(Math.max(0, index - 45), index + q.length + 110) +
              (index + q.length + 110 < content.length ? "…" : ""),
          });
        if (page % 8 === 0 || page === target.numPages) {
          setResults([...found]);
          setSearchProgress(Math.round((page / target.numPages) * 100));
          await new Promise((r) => setTimeout(r, 0));
        }
      }
      if (epoch === searchEpoch.current) {
        setResults(found);
        setSearchDone(true);
      }
    } catch {
      if (epoch === searchEpoch.current)
        notify("部分页面搜索失败，可以重新尝试。");
    } finally {
      if (epoch === searchEpoch.current) setSearching(false);
    }
  }
  async function backup() {
    try {
      if (
        await exportText(
          JSON.stringify(libraryRef.current, null, 2),
          `${EXPORT_PREFIX}-备份-${new Date().toISOString().slice(0, 10)}.json`,
        )
      )
        notify("备份已导出（不包含 PDF 原文件）");
    } catch (e) {
      notify(`导出失败：${String(e)}`);
    }
  }
  async function importBackup(file: File) {
    try {
      if (file.size > 30 * 1024 * 1024) throw new Error("备份文件过大");
      const incoming = validateLibrary(JSON.parse(await file.text()));
      const merged = mergeLibraries(libraryRef.current, incoming);
      validateLibrary(merged);
      await saveLibrary(merged);
      setLibrary(merged);
      libraryRef.current = merged;
      setStorageError(false);
      notify(`已合并 ${incoming.books.length} 本书的阅读资料`);
    } catch (e) {
      notify(`恢复失败：${e instanceof Error ? e.message : String(e)}`);
    }
  }
  async function exportNotes() {
    if (!book) return;
    const body =
      `# ${book.title}\n\n` +
      book.marks
        .slice()
        .sort((a, b) => a.page - b.page)
        .map(
          (m) =>
            `## 第 ${printedPage(m.page, book.pageOffset, labels)} 页（文件第 ${m.page} 页）\n\n${m.quote ? "> " + m.quote.replace(/\n/g, "\n> ") + "\n\n" : ""}${m.kind === "area" ? "[区域标注，坐标保存在 JSON 备份中]\n\n" : ""}${m.note || "（无附注）"}\n`,
        )
        .join("\n");
    try {
      if (await exportText(body, `${cleanName(book.title)}-笔记.md`))
        notify("笔记已导出");
    } catch (e) {
      notify(`导出失败：${String(e)}`);
    }
  }
  function goHome() {
    if (outlineEditing) {
      notify("请先完成或取消目录编辑/生成。");
      return;
    }
    searchEpoch.current++;
    window.dispatchEvent(new Event("pagewise:flush-position"));
    modifyWorkspace((w) => ({ ...w, home: true }));
    document.title = BRAND_TITLE;
  }
  async function fullscreen() {
    try {
      if (desktop) {
        const win = getCurrentWindow();
        await win.setFullscreen(!(await win.isFullscreen()));
      } else if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      notify("暂时无法切换全屏。");
    }
  }
  async function saveBeforeUpdate() {
    if (storageError || !initialized)
      throw new Error("书库尚未成功读取，暂不能升级。请先恢复阅读资料。");
    if (busy || passwordPrompt)
      throw new Error("请等待文件打开完成后再安装更新。");
    if (pendingOutlineWork)
      throw new Error(
        "目录仍在生成或编辑中，请先完成、应用或取消，再安装更新。",
      );
    if (workspace.tabs.some((t) => t.draft?.text.trim()))
      throw new Error(
        "还有未添加的新笔记，请先添加笔记或清空草稿，再安装更新。",
      );
    window.dispatchEvent(new Event("pagewise:flush-position"));
    setInstallingUpdate(true);
    try {
      await saveLibrary(libraryRef.current);
    } catch (error) {
      setInstallingUpdate(false);
      throw new Error(`阅读资料保存失败，已停止升级：${String(error)}`);
    }
  }
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (installingUpdate) {
        e.preventDefault();
        return;
      }
      const typing =
        e.target instanceof HTMLElement &&
        (["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName) ||
          e.target.isContentEditable);
      if (e.key === "F11") {
        e.preventDefault();
        void fullscreen();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "o") {
        e.preventDefault();
        void chooseFile();
        return;
      }
      if (!book || workspace.home) return;
      if (e.ctrlKey && e.key.toLowerCase() === "w") {
        e.preventDefault();
        if (activeTab) workspaceAction({ type: "close", tabId: activeTab.id });
        return;
      }
      if (e.ctrlKey && e.key === "Tab") {
        e.preventDefault();
        const group = workspace.groups.find(
          (g) => g.id === workspace.activeGroupId,
        )!;
        const i = group.tabs.indexOf(group.activeTabId),
          next =
            group.tabs[
              (i + (e.shiftKey ? -1 : 1) + group.tabs.length) %
                group.tabs.length
            ];
        workspaceAction({ type: "select", tabId: next });
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        setLeft(true);
        setTab("search");
        setTimeout(() => document.getElementById("pdf-search")?.focus(), 50);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        toggleBookmark();
        return;
      }
      if (typing) return;
      if (e.altKey && e.key === "ArrowLeft") {
        e.preventDefault();
        back();
      } else if (e.key === "ArrowRight" || e.key === "PageDown") {
        e.preventDefault();
        navigate(book.position.page + (book.mode === "spread" ? 2 : 1));
      } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        navigate(book.position.page - (book.mode === "spread" ? 2 : 1));
      } else if (e.key === "Escape") {
        setTool("select");
        setSettings(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  });

  const currentBookmark = book?.bookmarks.some(
    (b) => b.page === book.position.page,
  );
  const isReading = !workspace.home && workspace.groups.length > 0 && !!book;
  return (
    <div
      className="app"
      inert={installingUpdate}
      onDragOver={(e) => {
        if (!desktop && e.dataTransfer.types.includes("Files")) {
          e.preventDefault();
          setDragging(true);
        }
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node))
          setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        if (!desktop && e.dataTransfer.files[0])
          void openFile(e.dataTransfer.files[0]);
      }}
    >
      <input
        ref={fileInput}
        className="hidden"
        type="file"
        accept="application/pdf,.pdf"
        aria-label="选择 PDF 文件"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          const expectedId = relinkId.current;
          const collectionId = importCollectionId.current;
          relinkId.current = undefined;
          importCollectionId.current = undefined;
          if (f) void openFile(f, expectedId, collectionId);
        }}
      />
      <input
        ref={backupInput}
        className="hidden"
        type="file"
        accept="application/json,.json"
        aria-label="选择备份文件"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void importBackup(f);
        }}
      />
      {!isReading ? (
        <>
          <header className="home-header">
            <Brand />
            <div className="header-actions">
              <span className="home-nav-current">
                书架 <small>LIBRARY</small>
              </span>
              <button
                className="resume-workspace"
                disabled={!workspace.tabs.length}
                onClick={() => modifyWorkspace((w) => ({ ...w, home: false }))}
                title="继续上次阅读"
              >
                阅读工作区 <small>WORKSPACE</small>
                <span>{workspace.tabs.length.toString().padStart(2, "0")}</span>
              </button>
              <button
                className="icon-button"
                title="切换深色界面"
                onClick={() => updateLibrary((l) => ({ ...l, dark: !l.dark }))}
              >
                {library.dark ? <Sun size={18} /> : <Moon size={18} />}
              </button>
              <button
                className="icon-button"
                title="设置与备份"
                onClick={() => setSettings(true)}
              >
                <Settings2 size={18} />
              </button>
            </div>
          </header>
          <main className="library-home">
            <Bookshelf
              library={library}
              onChange={updateLibrary}
              onOpen={(book) => void reopen(book)}
              onChooseFile={(collectionId) => void chooseFile(collectionId)}
              disabled={storageError || !initialized}
              view={shelfView}
              onViewChange={setShelfView}
              saveStatus={saved}
              onDemo={() => void demo()}
            />
            <footer className="home-footer">
              <span>
                <ShieldCheck size={13} />
                {saved === "saving"
                  ? "正在保存…"
                  : saved === "error"
                    ? "保存失败，请导出备份"
                    : "本地资料已保存"}
                <small>LOCAL STORAGE</small>
              </span>
              <span>
                {BRAND_ENGLISH} <i /> READING ARCHIVE
              </span>
            </footer>
          </main>
        </>
      ) : (
        <>
          <header className="reading-header">
            <button className="icon-button" title="返回书架" onClick={goHome}>
              <ArrowLeft size={19} />
            </button>
            <Brand />
            <span className="toolbar-divider" />
            <div className="document-title">
              <strong title={book.title}>{book.title}</strong>
              <span>
                {book.pages} 页 · {desktop ? "本地 PDF" : "浏览器预览"}
              </span>
            </div>
            <div className="header-actions">
              <button
                className="icon-button"
                title="打开 PDF（Ctrl + O）"
                onClick={() => void chooseFile()}
              >
                <FolderOpen size={18} />
              </button>
              <button
                className="icon-button"
                title="切换深色界面"
                onClick={() => updateLibrary((l) => ({ ...l, dark: !l.dark }))}
              >
                {library.dark ? <Sun size={18} /> : <Moon size={18} />}
              </button>
              <button
                className="icon-button"
                title="设置与备份"
                onClick={() => {
                  setOffsetInput(
                    printedPage(book.position.page, book.pageOffset, labels),
                  );
                  setSettings(true);
                }}
              >
                <Settings2 size={18} />
              </button>
            </div>
          </header>
          <div className="reading-tools">
            <div className="tool-group">
              <button
                className={`icon-button ${left ? "active" : ""}`}
                title="切换目录面板"
                onClick={() => setLeft((v) => !v)}
              >
                {left ? (
                  <PanelLeftClose size={18} />
                ) : (
                  <PanelLeftOpen size={18} />
                )}
              </button>
              <button
                className="icon-button"
                title="返回上一阅读位置（Alt + ←）"
                disabled={!history.length}
                onClick={back}
              >
                <History size={18} />
              </button>
              <button
                className={`icon-button ${currentBookmark ? "active" : ""}`}
                title="添加或移除书签（Ctrl + B）"
                aria-label="切换书签"
                onClick={toggleBookmark}
              >
                <Bookmark
                  size={17}
                  fill={currentBookmark ? "currentColor" : "none"}
                />
              </button>
              <span className="toolbar-divider" />
              <button
                className={`tool-button ${tool === "select" ? "active" : ""}`}
                onClick={() => setTool("select")}
              >
                <MousePointer2 size={15} />
                <span>选择</span>
              </button>
              <button
                className={`tool-button ${tool === "highlight" ? "active" : ""}`}
                onClick={() => setTool("highlight")}
              >
                <Highlighter size={15} />
                <span>高亮</span>
              </button>
              <button
                className={`tool-button ${tool === "area" ? "active" : ""}`}
                onClick={() => setTool("area")}
              >
                <Scan size={15} />
                <span>框选</span>
              </button>
            </div>
            <div className="tool-group">
              <label className="mode-select">
                <select
                  aria-label="阅读模式"
                  value={book.mode}
                  onChange={(e) => {
                    updateBook((b) => ({
                      ...b,
                      mode: e.target.value as ViewMode,
                      position: { ...b.position, offset: 0 },
                    }));
                    setJump((j) => j + 1);
                  }}
                >
                  <option value="continuous">连续滚动</option>
                  <option value="single">单页阅读</option>
                  <option value="spread">双页阅读</option>
                </select>
                <ChevronDown size={13} />
              </label>
              <button
                className={`tool-button ${workspace.groups.length === 2 ? "active" : ""}`}
                onClick={() => {
                  if (workspace.groups.length === 2)
                    workspaceAction({ type: "merge" });
                  else if (activeTab) {
                    if (outlineEditing) {
                      notify("请先完成或取消目录编辑/生成。");
                      return;
                    }
                    try {
                      modifyWorkspace((w) => {
                        const existing = w.tabs.find(
                          (t) =>
                            t.id !== activeTab.id &&
                            t.bookId === activeTab.bookId,
                        );
                        return {
                          ...splitReaderTab(
                            w,
                            existing?.id || activeTab.id,
                            "horizontal",
                            !existing,
                            selectedBook?.secondary,
                          ),
                          activeGroupId: w.activeGroupId,
                        };
                      });
                    } catch (error) {
                      notify(String(error));
                    }
                  }
                }}
              >
                <Columns2 size={16} />
                <span>分屏对照</span>
              </button>
              <span className="toolbar-divider" />
              <button
                className={`icon-button ${right ? "active" : ""}`}
                title="切换笔记面板"
                onClick={() => setRight((v) => !v)}
              >
                {right ? (
                  <PanelRightClose size={18} />
                ) : (
                  <PanelRightOpen size={18} />
                )}
              </button>
            </div>
          </div>
          <div className="reading-workspace">
            <aside className="left-panel" hidden={!left}>
              <div className="active-document-caption" title={book.title}>
                当前文档：{book.title}
              </div>
              <div className="sidebar-tabs">
                <button
                  title="目录"
                  className={tab === "outline" ? "selected" : ""}
                  onClick={() => setTab("outline")}
                >
                  <List size={16} />
                  目录
                </button>
                <button
                  title="书签"
                  className={tab === "bookmarks" ? "selected" : ""}
                  onClick={() => setTab("bookmarks")}
                >
                  <Bookmark size={15} />
                  书签
                </button>
                <button
                  title="搜索"
                  className={tab === "search" ? "selected" : ""}
                  onClick={() => setTab("search")}
                >
                  <Search size={15} />
                  搜索
                </button>
                <button
                  title="缩略图"
                  className={tab === "pages" ? "selected" : ""}
                  onClick={() => setTab("pages")}
                >
                  <FileText size={15} />
                </button>
              </div>
              <div
                className={`sidebar-content ${tab === "outline" ? "has-outline" : ""}`}
              >
                {tab === "pages" && pdf && (
                  <Thumbnails
                    pdf={pdf}
                    current={book.position.page}
                    onNavigate={navigate}
                  />
                )}
                <div className="outline-host" hidden={tab !== "outline"}>
                  {pdf && (
                    <OutlinePanel
                      onPendingWorkChange={setPendingOutlineWork}
                      onEditingChange={setOutlineEditing}
                      key={activeTab!.id}
                      pdf={pdf}
                      book={book}
                      nativeOutline={outline}
                      labels={labels}
                      notify={notify}
                      onNavigate={(target, secondary) =>
                        void navigateToToc(target, secondary)
                      }
                      onUpdate={(patch) =>
                        updateLibrary((l) => ({
                          ...l,
                          books: l.books.map((b) =>
                            b.id === book.id ? { ...b, ...patch } : b,
                          ),
                        }))
                      }
                    />
                  )}
                </div>
                {tab === "bookmarks" && (
                  <>
                    <div className="sidebar-caption">
                      BOOKMARKS{" "}
                      <button
                        className="icon-button"
                        title="添加当前页"
                        onClick={toggleBookmark}
                      >
                        <Plus size={15} />
                      </button>
                    </div>
                    {book.bookmarks.length ? (
                      book.bookmarks
                        .slice()
                        .sort((a, b) => a.page - b.page)
                        .map((b) => (
                          <div className="bookmark-row" key={b.id}>
                            <button onClick={() => navigate(b.page)}>
                              <Bookmark size={14} />
                              <span>{b.title}</span>
                              <small>{b.page}</small>
                            </button>
                            <button
                              className="icon-button delete-button"
                              aria-label={`删除书签 ${b.title}`}
                              onClick={() =>
                                updateBook((old) => ({
                                  ...old,
                                  bookmarks: old.bookmarks.filter(
                                    (m) => m.id !== b.id,
                                  ),
                                }))
                              }
                            >
                              <X size={13} />
                            </button>
                          </div>
                        ))
                    ) : (
                      <div className="sidebar-empty">
                        <Bookmark size={27} strokeWidth={1.2} />
                        <p>留下一个阅读坐标</p>
                        <span>按 Ctrl + B 收藏当前页。</span>
                      </div>
                    )}
                  </>
                )}
                {tab === "search" && (
                  <>
                    <form
                      className="search-form"
                      onSubmit={(e) => {
                        e.preventDefault();
                        void runSearch();
                      }}
                    >
                      <Search size={16} />
                      <input
                        id="pdf-search"
                        maxLength={10000}
                        placeholder="在本书中搜索…"
                        value={query}
                        onChange={(e) => {
                          searchEpoch.current++;
                          setSearching(false);
                          setSearchDone(false);
                          setResults([]);
                          setQuery(e.target.value);
                        }}
                      />
                      <button type="submit" aria-label="开始搜索">
                        <ArrowUpRight size={16} />
                      </button>
                    </form>
                    {searching ? (
                      <div className="search-status">
                        <LoaderCircle size={14} className="spin" />
                        正在搜索 {searchProgress}%
                        <button
                          onClick={() => {
                            searchEpoch.current++;
                            setSearching(false);
                          }}
                        >
                          停止
                        </button>
                      </div>
                    ) : (
                      <div className="sidebar-caption">
                        {searchDone
                          ? `${results.length} 个页面包含结果`
                          : "输入关键词，按 Enter 搜索"}
                      </div>
                    )}
                    {results.map((r) => (
                      <button
                        className="search-result"
                        key={r.page}
                        onClick={() => navigate(r.page)}
                      >
                        <span>
                          第 {printedPage(r.page, book.pageOffset, labels)} 页
                        </span>
                        <p>{r.text}</p>
                      </button>
                    ))}
                    {searchDone && !results.length && (
                      <div className="sidebar-empty">
                        <Search size={27} strokeWidth={1.2} />
                        <p>没有找到相关文字</p>
                        <span>无文字层的扫描版需要先做 OCR。</span>
                      </div>
                    )}
                  </>
                )}
              </div>
              <div className="sidebar-bottom">
                <span className={saved === "error" ? "error-text" : ""}>
                  {saved === "saving" ? (
                    <LoaderCircle size={13} className="spin" />
                  ) : saved === "saved" ? (
                    <Check size={13} />
                  ) : (
                    <X size={13} />
                  )}{" "}
                  {saved === "saved"
                    ? "阅读资料已保存"
                    : saved === "saving"
                      ? "正在保存…"
                      : "保存失败"}
                </span>
              </div>
            </aside>
            <WorkspaceView
              workspace={workspace}
              books={library.books}
              onAction={workspaceAction}
              onOpen={(groupId) => {
                openingGroup.current = groupId;
                void chooseFile();
              }}
              renderTab={(readerTab, index) => {
                const document = pool.documents[readerTab.bookId],
                  stored = library.books.find(
                    (b) => b.id === readerTab.bookId,
                  )!;
                const activate = () => {
                  if (activeTab?.id !== readerTab.id)
                    workspaceAction({ type: "select", tabId: readerTab.id });
                };
                if (!document)
                  return (
                    <div
                      className="workspace-file-state"
                      onPointerDown={activate}
                    >
                      <strong>{stored.title}</strong>
                      <p>{pool.errors[stored.id] || "正在打开教材…"}</p>
                      {pool.errors[stored.id] && (
                        <>
                          <button
                            className="secondary-button"
                            onClick={() => {
                              activate();
                              setMissingBook(stored);
                            }}
                          >
                            重新定位 PDF
                          </button>
                          <button className="text-button" onClick={pool.retry}>
                            重试
                          </button>
                        </>
                      )}
                      <button
                        className="text-button"
                        onClick={() =>
                          workspaceAction({
                            type: "close",
                            tabId: readerTab.id,
                          })
                        }
                      >
                        关闭此标签
                      </button>
                    </div>
                  );
                return (
                  <Reader
                    key={readerTab.id}
                    pdf={document.pdf}
                    position={readerTab.position}
                    mode={readerTab.mode}
                    marks={stored.marks}
                    tool={
                      outlineEditing && activeTab?.id !== readerTab.id
                        ? "select"
                        : tool
                    }
                    labels={document.labels}
                    pageOffset={stored.pageOffset}
                    search={readerTab.query}
                    jumpTicket={jumps[readerTab.id] || 0}
                    secondary={index === 1}
                    keyboardZoomActive={
                      activeTab?.id === readerTab.id &&
                      !settings &&
                      !busy &&
                      !passwordPrompt &&
                      !installingUpdate
                    }
                    onActivate={activate}
                    onPosition={(position) =>
                      modifyTab(readerTab.id, (t) => ({ ...t, position }))
                    }
                    onNavigate={(page) => navigateTab(readerTab.id, page)}
                    onMark={(page, rects, quote, kind) =>
                      addMark(readerTab.id, page, rects, quote, kind)
                    }
                    onFocusMark={(id) => {
                      activate();
                      focusMark(id);
                    }}
                  />
                );
              }}
            />
            {right && (
              <aside className="notes-panel">
                <div className="active-document-caption" title={book.title}>
                  笔记归属：{book.title}
                </div>
                <div className="notes-heading">
                  <h2>
                    <MessageSquare size={17} />
                    标注与笔记<span>{book.marks.length}</span>
                  </h2>
                  <button
                    className="icon-button"
                    title="导出 Markdown 笔记"
                    onClick={() => void exportNotes()}
                  >
                    <Download size={16} />
                  </button>
                </div>
                <div className="note-composer">
                  <span>
                    第{" "}
                    {printedPage(
                      activeTab?.draft?.page || book.position.page,
                      book.pageOffset,
                      labels,
                    )}{" "}
                    页 · 写下你的想法
                  </span>
                  <textarea
                    placeholder="一个疑问，一点理解…"
                    maxLength={100000}
                    value={noteDraft}
                    onChange={(e) => setNoteDraft(e.target.value)}
                    aria-label="新笔记"
                  />
                  <button
                    className="small-primary"
                    disabled={!noteDraft.trim()}
                    onClick={addNote}
                  >
                    <Plus size={14} />
                    添加笔记
                  </button>
                </div>
                <div className="notes-list">
                  {book.marks.length ? (
                    book.marks
                      .slice()
                      .sort((a, b) => a.page - b.page || a.created - b.created)
                      .map((m) => (
                        <article
                          id={`mark-${m.id}`}
                          className={`note-card ${focusedMark === m.id ? "focused" : ""}`}
                          key={m.id}
                        >
                          <div className="note-meta">
                            <button onClick={() => navigate(m.page)}>
                              {m.kind === "highlight" ? (
                                <Highlighter size={13} />
                              ) : m.kind === "area" ? (
                                <Scan size={13} />
                              ) : (
                                <MessageSquare size={13} />
                              )}
                              第 {printedPage(m.page, book.pageOffset, labels)}{" "}
                              页
                            </button>
                            <button
                              className="icon-button delete-button"
                              title="删除标注"
                              onClick={() => {
                                updateBook((b) => ({
                                  ...b,
                                  marks: b.marks.filter(
                                    (mark) => mark.id !== m.id,
                                  ),
                                }));
                                notify("已删除标注");
                              }}
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                          {m.quote && (
                            <blockquote onClick={() => navigate(m.page)}>
                              {m.quote}
                            </blockquote>
                          )}
                          {m.kind === "area" && (
                            <button
                              className="area-reference"
                              onClick={() => navigate(m.page)}
                            >
                              <Scan size={15} />
                              查看框选区域
                              <ArrowUpRight size={13} />
                            </button>
                          )}
                          <textarea
                            aria-label={`第 ${m.page} 页的标注笔记`}
                            placeholder="添加一点想法…"
                            value={m.note}
                            onChange={(e) =>
                              updateBook((b) => ({
                                ...b,
                                marks: b.marks.map((mark) =>
                                  mark.id === m.id
                                    ? { ...mark, note: e.target.value }
                                    : mark,
                                ),
                              }))
                            }
                          />
                        </article>
                      ))
                  ) : (
                    <div className="sidebar-empty">
                      <Highlighter size={29} strokeWidth={1.2} />
                      <p>让阅读留下痕迹</p>
                      <span>
                        选择“高亮”后拖选文字，
                        <br />
                        或用“框选”标记图表与扫描页。
                      </span>
                    </div>
                  )}
                </div>
              </aside>
            )}
          </div>
        </>
      )}
      {missingBook && (
        <div className="modal-backdrop">
          <section
            className="settings-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="relink-title"
          >
            <div className="modal-heading">
              <h2 id="relink-title">重新定位 PDF</h2>
              <button
                className="icon-button"
                title="关闭重新定位"
                onClick={() => setMissingBook(null)}
              >
                <X size={18} />
              </button>
            </div>
            <div className="setting-section">
              <p>
                无法读取《{missingBook.title}
                》的原文件。书架、进度、笔记和目录已保留。
              </p>
              {missingBook.path && (
                <p className="file-path">原路径：{missingBook.path}</p>
              )}
              <p>
                请选择同一份 PDF
                的新位置，确认内容一致后恢复关联。升级软件不会移动或包含你的原
                PDF。
              </p>
              <button
                className="primary-button"
                onClick={() => void relocateBook()}
              >
                选择原 PDF 的新位置
              </button>
            </div>
          </section>
        </div>
      )}
      <div hidden={!settings}>
        <div
          className="modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setSettings(false);
          }}
        >
          <section
            className="settings-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-title"
          >
            <div className="modal-heading">
              <h2 id="settings-title">阅读设置</h2>
              <button
                className="icon-button"
                title="关闭设置"
                onClick={() => setSettings(false)}
              >
                <X size={19} />
              </button>
            </div>
            <div className="setting-section">
              <h3>本地资料</h3>
              <p>
                备份包含书架、进度、书签与标注，不包含 PDF
                原文件。恢复时与现有资料合并。
              </p>
              <div className="setting-buttons">
                <button
                  className="secondary-button"
                  onClick={() => void backup()}
                >
                  <Download size={15} />
                  导出备份
                </button>
                <button
                  className="secondary-button"
                  onClick={() => backupInput.current?.click()}
                >
                  <Upload size={15} />
                  恢复备份
                </button>
              </div>
              {storageError && (
                <p className="error-text">
                  书库读取异常，自动保存已暂停。恢复有效备份后重新启用。
                </p>
              )}
            </div>
            {book && (
              <div className="setting-section">
                <h3>校准教材页码</h3>
                <p>
                  当前文件第 {book.position.page} 页，在教材上印刷的页码是：
                </p>
                <form
                  className="offset-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!/^\d+$/.test(offsetInput.trim())) {
                      notify("请输入有效的整数页码");
                      return;
                    }
                    updateBook((b) => ({
                      ...b,
                      pageOffset: b.position.page - Number(offsetInput),
                    }));
                    notify("页码已校准");
                  }}
                >
                  <input
                    aria-label="印刷页码"
                    value={offsetInput}
                    onChange={(e) => setOffsetInput(e.target.value)}
                    placeholder="例如 1"
                  />
                  <button className="secondary-button">应用</button>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => {
                      updateBook((b) => ({ ...b, pageOffset: 0 }));
                      notify("已恢复 PDF 默认页码");
                    }}
                  >
                    重置
                  </button>
                </form>
              </div>
            )}
            <div className="setting-section">
              <h3>
                <Keyboard size={16} />
                常用快捷键
              </h3>
              <div className="shortcut-grid">
                <span>打开 PDF</span>
                <kbd>Ctrl O</kbd>
                <span>全文搜索</span>
                <kbd>Ctrl F</kbd>
                <span>添加书签</span>
                <kbd>Ctrl B</kbd>
                <span>返回阅读位置</span>
                <kbd>Alt ←</kbd>
                <span>上一页 / 下一页</span>
                <kbd>← / →</kbd>
                <span>全屏阅读</span>
                <kbd>F11</kbd>
                <span>放大 / 缩小内容</span>
                <kbd>Ctrl + / -</kbd>
                <span>鼠标所在阅读区缩放</span>
                <kbd>Ctrl + 滚轮</kbd>
              </div>
            </div>
            <UpdatePanel
              visible={settings}
              beforeInstall={saveBeforeUpdate}
              onInstallingChange={setInstallingUpdate}
              onAvailable={() =>
                notify("发现新版本，可在“设置与备份 → 软件更新”下载升级。")
              }
            />
            <div className="settings-foot">
              <Brand />
              <span>{appVersion} · 莱茵档案</span>
            </div>
            <details className="brand-attribution">
              <summary>关于莱茵档案</summary>
              <p>
                莱茵生命 Logo
                参考《明日方舟》，标志权利归各自权利人所有；本应用与官方无隶属关系。
              </p>
              <p>
                矢量复刻路径来源：LBEILC / RhineLabUI。相关代码 Copyright © 2026
                LBEILC，采用 MIT 许可。字体使用本机系统字体。
              </p>
            </details>
          </section>
        </div>
      </div>
      {passwordPrompt && (
        <div className="modal-backdrop">
          <form
            className="password-modal"
            onSubmit={(e) => {
              e.preventDefault();
              passwordPrompt.update(password);
              if (passwordPrompt.id === "opening") setBusy("正在解锁教材…");
              dismissPassword(passwordPrompt.id);
              setPassword("");
            }}
          >
            <h2>这本 PDF 需要密码</h2>
            <p>{passwordPrompt.title}</p>
            <p>
              {passwordPrompt.wrong
                ? "密码不正确，请重新输入。"
                : "密码只用于本次打开，不会保存。"}
            </p>
            <input
              type="password"
              autoFocus
              aria-label="PDF 密码"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <div className="setting-buttons">
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  passwordPrompt.cancel();
                  dismissPassword(passwordPrompt.id);
                }}
              >
                取消
              </button>
              <button className="primary-button" disabled={!password}>
                打开
              </button>
            </div>
          </form>
        </div>
      )}
      {(busy || !initialized) && !passwordPrompt && (
        <div className="loading-overlay">
          <div>
            <LoaderCircle size={24} className="spin" />
            <span>{busy || "正在整理书架…"}</span>
          </div>
        </div>
      )}
      {dragging && (
        <div className="drop-overlay">
          <FileText size={40} />
          <h2>松开，开始阅读</h2>
          <p>你的 PDF 会保留在本机</p>
        </div>
      )}
      {toast && (
        <div className="toast" role="status">
          <span>{toast}</span>
          <button aria-label="关闭提示" onClick={() => setToast("")}>
            <X size={15} />
          </button>
        </div>
      )}
    </div>
  );
}
