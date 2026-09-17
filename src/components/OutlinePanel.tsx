import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import {
  ChevronDown,
  ChevronRight,
  Download,
  List,
  LoaderCircle,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import type { Book } from "../model";
import { destinationPage, type Outline } from "../pdf";
import { exportText } from "../storage";
import { generateToc } from "../toc/generate";
import {
  descendants,
  emptyToc,
  tocDepth,
  validateToc,
  TOC_VERSION,
  type GeneratedToc,
  type TocNode,
  type TocOptions,
  type TocTarget,
} from "../toc/types";
import type { Progress } from "../toc/extract";

type Props = {
  pdf: PDFDocumentProxy;
  book: Book;
  nativeOutline: Outline[];
  labels: string[] | null;
  onUpdate: (patch: Partial<Book>) => void;
  onNavigate: (target: TocTarget, secondary: boolean) => void;
  notify: (message: string) => void;
};
type DisplayNode = {
  id: string;
  parentId: string | null;
  title: string;
  target: TocTarget | null;
  review?: TocNode["review"];
};
const cloneToc = (toc: GeneratedToc) => structuredClone(toc);
const EMPTY_NODES: TocNode[] = [];

export default function OutlinePanel({
  pdf,
  book,
  nativeOutline,
  labels,
  onUpdate,
  onNavigate,
  notify,
}: Props) {
  const [source, setSource] = useState<"native" | "custom">(
    book.generatedToc || book.tocDraft || !nativeOutline.length
      ? "custom"
      : "native",
  );
  const [setup, setSetup] = useState(false);
  const [mode, setMode] = useState<TocOptions["mode"]>("auto");
  const [start, setStart] = useState("1"),
    [end, setEnd] = useState(String(Math.min(10, book.pages)));
  const [progress, setProgress] = useState<Progress | null>(null);
  const [message, setMessage] = useState("");
  const [filter, setFilter] = useState("");
  const [collapsed, setCollapsed] = useState(new Set<string>());
  const [nativeNodes, setNativeNodes] = useState<DisplayNode[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const [editTitle, setEditTitle] = useState(""),
    [editPage, setEditPage] = useState(""),
    [editParent, setEditParent] = useState("");
  const [secondary, setSecondary] = useState(false);
  const [offsets, setOffsets] = useState(new Map<string, number>());
  const job = useRef<AbortController | null>(null);
  const alive = useRef(true);
  const activePdf = useRef(pdf);
  activePdf.current = pdf;
  const current = useRef({ book, onUpdate, notify });
  current.current = { book, onUpdate, notify };
  const position = secondary && book.split ? book.secondary : book.position;
  const signature = book.documentSignature!;
  const custom = book.tocDraft || book.generatedToc;
  const stale = !!custom && custom.documentSignature !== signature;
  const oldRecognition = !!custom && custom.analyzerVersion !== TOC_VERSION;
  const nodes: DisplayNode[] =
    source === "native" ? nativeNodes : custom?.nodes || EMPTY_NODES;
  const map = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const children = useMemo(() => {
    const groups = new Map<string | null, DisplayNode[]>();
    for (const n of nodes)
      groups.set(n.parentId, [...(groups.get(n.parentId) || []), n]);
    return groups;
  }, [nodes]);

  useEffect(() => {
    alive.current = true;
    setProgress(null);
    setMessage("");
    setEditing(null);
    return () => {
      alive.current = false;
      job.current?.abort();
    };
  }, [pdf]);
  useLayoutEffect(() => {
    if (!editing || !listRef.current) return;
    const list = listRef.current;
    const item = [...list.querySelectorAll<HTMLElement>("[data-toc-id]")].find(
      (node) => node.dataset.tocId === editing,
    );
    const row = item?.querySelector<HTMLElement>(".toc-row");
    if (row) {
      const bounds = list.getBoundingClientRect();
      const selected = row.getBoundingClientRect();
      if (selected.top < bounds.top + 8)
        list.scrollTop += selected.top - bounds.top - 8;
      else if (selected.bottom > bounds.bottom - 8)
        list.scrollTop += selected.bottom - bounds.bottom + 8;
    }
    titleInputRef.current?.focus({ preventScroll: true });
  }, [editing]);
  useEffect(() => {
    if (!book.split) setSecondary(false);
  }, [book.split]);
  useEffect(() => {
    let disposed = false;
    const stack: { id: string; depth: number }[] = [];
    const mapped = nativeOutline.map((o, i) => {
      while (stack.length && stack.at(-1)!.depth >= o.depth) stack.pop();
      const n = {
        id: `native-${i}`,
        parentId: stack.at(-1)?.id || null,
        title: o.title,
        target: null as TocTarget | null,
      };
      stack.push({ id: n.id, depth: o.depth });
      return n;
    });
    setNativeNodes(mapped);
    void Promise.all(
      nativeOutline.map(async (o, i) => {
        const page = await destinationPage(pdf, o.dest).catch(() => null);
        return { ...mapped[i], target: page ? { page } : null };
      }),
    ).then((result) => {
      if (!disposed) setNativeNodes(result);
    });
    return () => {
      disposed = true;
    };
  }, [pdf, nativeOutline]);
  useEffect(() => {
    let cancelled = false;
    void Promise.all(
      nodes.map(async (n) => {
        if (!n.target?.point) return [n.id, 0] as const;
        const page = await pdf.getPage(n.target.page);
        const view = page.getViewport({
          scale: 1,
          rotation: (page.rotate + position.rotation) % 360,
        });
        return [
          n.id,
          Math.max(
            0,
            view.convertToViewportPoint(...n.target.point)[1] / view.height,
          ),
        ] as const;
      }),
    )
      .then((values) => {
        if (!cancelled) setOffsets(new Map(values));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [nodes, pdf, position.rotation]);
  const activeId = useMemo(() => {
    const ordered = nodes
      .filter((n) => n.target)
      .slice()
      .sort(
        (a, b) =>
          a.target!.page - b.target!.page ||
          (offsets.get(a.id) || 0) - (offsets.get(b.id) || 0),
      );
    return ordered
      .filter(
        (n) =>
          n.target!.page < position.page ||
          (n.target!.page === position.page &&
            (offsets.get(n.id) || 0) <= position.offset + 0.035),
      )
      .at(-1)?.id;
  }, [nodes, offsets, position.page, position.offset]);
  useEffect(() => {
    if (!activeId) return;
    setCollapsed((old) => {
      const next = new Set(old);
      let parent = map.get(activeId)?.parentId;
      while (parent) {
        next.delete(parent);
        parent = map.get(parent)?.parentId;
      }
      return next;
    });
  }, [activeId, map]);
  const matching = useMemo(() => {
    if (!filter.trim()) return null;
    const ids = new Set<string>();
    for (const n of nodes)
      if (
        n.title.toLocaleLowerCase().includes(filter.trim().toLocaleLowerCase())
      ) {
        ids.add(n.id);
        let parent = n.parentId;
        while (parent) {
          ids.add(parent);
          parent = map.get(parent)?.parentId || null;
        }
      }
    return ids;
  }, [filter, nodes, map]);

  function storeDraft(toc: GeneratedToc) {
    toc.updatedAt = Date.now();
    validateToc(toc, book.pages);
    onUpdate({ tocDraft: toc });
    setSource("custom");
  }
  function editableDraft(): GeneratedToc {
    const draft = custom ? cloneToc(custom) : emptyToc(signature);
    if (draft.documentSignature !== signature) {
      draft.documentSignature = signature;
      draft.nodes = draft.nodes.map((n) => ({
        ...n,
        target: null,
        review: "unresolved",
      }));
    }
    return draft;
  }
  function editNode(id: string) {
    const draft = editableDraft();
    const node = draft.nodes.find((n) => n.id === id);
    if (!node) return;
    storeDraft(draft);
    setEditing(id);
    setEditTitle(node.title);
    setEditPage(node.target ? String(node.target.page) : "");
    setEditParent(node.parentId || "");
  }
  async function currentTarget(): Promise<TocTarget> {
    const page = await pdf.getPage(position.page);
    const view = page.getViewport({
      scale: 1,
      rotation: (page.rotate + position.rotation) % 360,
    });
    const p = view.convertToPdfPoint(0, position.offset * view.height);
    return { page: position.page, point: [p[0], p[1]] };
  }
  async function addManual() {
    const id = book.id;
    let target: TocTarget;
    try {
      target = await currentTarget();
    } catch {
      if (alive.current) notify("无法读取当前页，请重试。");
      return;
    }
    if (
      !alive.current ||
      activePdf.current !== pdf ||
      current.current.book.id !== id
    )
      return;
    const draft = editableDraft();
    const node: TocNode = {
      id: crypto.randomUUID(),
      parentId: null,
      title: `第 ${target.page} 页`,
      target,
      source: "manual",
      review: "verified",
      sourcePage: target.page,
      manuallyEdited: true,
    };
    draft.nodes.push(node);
    storeDraft(draft);
    setEditing(node.id);
    setEditTitle(node.title);
    setEditPage(String(target.page));
    setEditParent("");
  }
  async function bindCurrent() {
    const id = editing,
      bookId = book.id;
    let target: TocTarget;
    try {
      target = await currentTarget();
    } catch {
      if (alive.current) notify("无法读取当前页，请重试。");
      return;
    }
    if (
      !alive.current ||
      activePdf.current !== pdf ||
      !id ||
      current.current.book.id !== bookId ||
      !current.current.book.tocDraft
    )
      return;
    const draft = cloneToc(current.current.book.tocDraft!);
    const node = draft.nodes.find((n) => n.id === id);
    if (!node) return;
    node.target = target;
    node.review = "verified";
    node.manuallyEdited = true;
    storeDraft(draft);
    setEditPage(String(target.page));
    notify("已绑定到当前阅读位置");
  }
  function applyEdit() {
    const draft = cloneToc(book.tocDraft!);
    const node = draft.nodes.find((n) => n.id === editing);
    if (!node) return;
    if (!editTitle.trim()) {
      notify("目录标题不能为空");
      return;
    }
    const page = editPage.trim() ? Number(editPage) : null;
    if (
      page !== null &&
      (!/^\d+$/.test(editPage) || page < 1 || page > book.pages)
    ) {
      notify(`请输入 1～${book.pages} 的 PDF 文件页码`);
      return;
    }
    node.title = editTitle.trim();
    node.parentId = editParent || null;
    node.manuallyEdited = true;
    node.target =
      page === null
        ? null
        : page === node.target?.page
          ? node.target
          : { page };
    node.review = node.target ? "verified" : "unresolved";
    try {
      storeDraft(draft);
      setEditing(null);
    } catch (e) {
      notify(e instanceof Error ? e.message : "层级调整无效，最多支持 7 层");
    }
  }
  function removeNode() {
    const draft = cloneToc(book.tocDraft!);
    const removed = draft.nodes.find((n) => n.id === editing);
    if (!removed) return;
    draft.nodes = draft.nodes
      .filter((n) => n.id !== editing)
      .map((n) =>
        n.parentId === editing ? { ...n, parentId: removed.parentId } : n,
      );
    storeDraft(draft);
    setEditing(null);
  }
  function saveDraft() {
    if (!book.tocDraft?.nodes.length) return;
    validateToc(book.tocDraft, book.pages);
    onUpdate({
      previousToc: book.generatedToc || book.previousToc,
      generatedToc: { ...book.tocDraft, updatedAt: Date.now() },
      tocDraft: undefined,
    });
    setEditing(null);
    notify("目录已保存，可在重新打开和备份后继续使用");
  }
  async function runGeneration() {
    const range =
      mode === "printed"
        ? ([Number(start), Number(end)] as [number, number])
        : undefined;
    if (
      range &&
      (!/^\d+$/.test(start) ||
        !/^\d+$/.test(end) ||
        range[0] < 1 ||
        range[1] > book.pages ||
        range[0] > range[1])
    ) {
      notify("请输入有效的目录页范围（PDF 文件页码）");
      return;
    }
    job.current?.abort();
    const controller = new AbortController();
    job.current = controller;
    const id = book.id;
    setSetup(false);
    setMessage("");
    setEditing(null);
    setProgress({ done: 0, total: pdf.numPages, message: "准备读取目录" });
    try {
      const result = await generateToc(
        pdf,
        {
          mode,
          range,
          labels,
          pageOffset: book.pageOffset,
          documentSignature: signature,
        },
        controller.signal,
        setProgress,
      );
      if (controller.signal.aborted || current.current.book.id !== id) return;
      setMessage(result.message);
      if (result.toc.nodes.length) {
        current.current.onUpdate({ tocDraft: result.toc });
        setSource("custom");
        setCollapsed(new Set());
      }
    } catch (e) {
      if (!controller.signal.aborted && current.current.book.id === id)
        setMessage(e instanceof Error ? e.message : "目录生成失败，请重试");
    } finally {
      if (!controller.signal.aborted && current.current.book.id === id)
        setProgress(null);
    }
  }
  function cancel() {
    job.current?.abort();
    job.current = null;
    setProgress(null);
    setMessage("已取消生成，原有目录保持不变。");
  }
  async function exportOutline() {
    if (!custom) return;
    try {
      if (
        await exportText(JSON.stringify(custom, null, 2), "Pagewise-目录.json")
      )
        notify("目录已导出；完整迁移请使用设置中的书库备份");
    } catch {
      notify("导出失败，请重试");
    }
  }
  function draw(parentId: string | null, depth = 0): React.ReactNode {
    return (children.get(parentId) || [])
      .filter((n) => !matching || matching.has(n.id))
      .map((n) => {
        const hasChildren = !!children.get(n.id)?.length;
        const open = !collapsed.has(n.id) || !!matching;
        return (
          <div
            role="treeitem"
            aria-level={depth + 1}
            aria-expanded={hasChildren ? open : undefined}
            aria-selected={activeId === n.id}
            key={n.id}
            data-toc-id={n.id}
          >
            <div
              className={`toc-row ${activeId === n.id ? "current" : ""} ${editing === n.id ? "editing" : ""}`}
              style={{ paddingLeft: 4 + Math.min(depth, 6) * 12 }}
            >
              {hasChildren ? (
                <button
                  className="toc-fold"
                  title={open ? "折叠章节" : "展开章节"}
                  onClick={() =>
                    setCollapsed((old) => {
                      const next = new Set(old);
                      if (next.has(n.id)) next.delete(n.id);
                      else next.add(n.id);
                      return next;
                    })
                  }
                >
                  {open ? (
                    <ChevronDown size={13} />
                  ) : (
                    <ChevronRight size={13} />
                  )}
                </button>
              ) : (
                <span className="toc-leaf" />
              )}
              <button
                className="outline-item toc-jump"
                title={
                  n.target
                    ? `文件第 ${n.target.page} 页${n.review === "needs-review" ? " · 请核对目标" : ""}`
                    : "尚未确定目标页，请编辑定位"
                }
                disabled={!n.target || (stale && source === "custom")}
                onClick={() =>
                  n.target && onNavigate(n.target, secondary && book.split)
                }
              >
                <span>{n.title}</span>
                {n.target && <small>{n.target.page}</small>}
              </button>
              {source === "custom" && (
                <button
                  className="toc-edit icon-button"
                  title={`编辑目录：${n.title}`}
                  onClick={() => editNode(n.id)}
                >
                  <Pencil size={12} />
                </button>
              )}
            </div>
            {source === "custom" && n.review !== "verified" && (
              <span
                className="toc-review"
                style={{ marginLeft: 23 + depth * 12 }}
              >
                {n.target ? "待核对" : "待定位"}
              </span>
            )}
            {hasChildren && open && (
              <div role="group">{draw(n.id, depth + 1)}</div>
            )}
          </div>
        );
      });
  }
  const forbidden =
    editing && book.tocDraft
      ? descendants(book.tocDraft.nodes, editing)
      : new Set<string>();
  return (
    <section className="toc-panel" aria-label="教材目录">
      <div className="toc-scroll" ref={listRef}>
        <div className="toc-heading">
          <span>
            CONTENTS <small>{nodes.length} 项</small>
          </span>
          {nativeOutline.length > 0 && (
            <select
              aria-label="目录来源"
              value={source}
              onChange={(e) => setSource(e.target.value as "native" | "custom")}
            >
              <option value="native">PDF 原始目录</option>
              <option value="custom">我的目录</option>
            </select>
          )}
        </div>
        {book.split && (
          <label className="toc-pane-choice">
            跳转到
            <select
              aria-label="目录跳转区域"
              value={secondary ? "secondary" : "main"}
              onChange={(e) => setSecondary(e.target.value === "secondary")}
            >
              <option value="main">主阅读区</option>
              <option value="secondary">对照阅读区</option>
            </select>
          </label>
        )}
        <div className="toc-actions">
          <button
            className="secondary-button"
            disabled={!!progress || !!book.tocDraft}
            onClick={() => setSetup(true)}
          >
            <Sparkles size={14} />
            {book.generatedToc ? "重新生成" : "生成目录"}
          </button>
          <button
            className="icon-button"
            title="手动添加目录"
            disabled={!!progress}
            onClick={() => void addManual()}
          >
            <Plus size={16} />
          </button>
          {source === "custom" && custom && (
            <button
              className="icon-button"
              title="导出目录 JSON"
              onClick={() => void exportOutline()}
            >
              <Download size={14} />
            </button>
          )}
        </div>
        {progress && (
          <div className="toc-progress" role="status">
            <span>
              <LoaderCircle size={14} className="spin" />
              {progress.message}
            </span>
            <progress max={progress.total} value={progress.done} />
            <div>
              {progress.done} / {progress.total} 页
              <button onClick={cancel}>取消生成</button>
            </div>
          </div>
        )}
        {message && (
          <p className="toc-message" role="status">
            {message}
          </p>
        )}
        {source === "custom" && oldRecognition && (
          <p className="toc-warning" data-testid="toc-algorithm-update">
            目录识别方式已更新，可重新生成这份目录。
            {book.tocDraft
              ? "请先保存或放弃当前草稿。"
              : "已有目录和手工修改会保留为上一版。"}
          </p>
        )}
        {source === "custom" && stale && (
          <p className="toc-warning">
            文件内容已变化，旧目录需要重新生成或逐项编辑定位。已保存的原目录仍保留。
          </p>
        )}
        {source === "custom" && book.tocDraft && (
          <div className="toc-draft">
            <strong>目录草稿</strong>
            <p>可点击试跳，或用铅笔修改。保存后正式使用。</p>
            <div>
              <button
                className="small-primary"
                disabled={!book.tocDraft.nodes.length || stale || !!editing}
                onClick={saveDraft}
              >
                保存使用
              </button>
              <button
                className="text-button"
                onClick={() => {
                  onUpdate({ tocDraft: undefined });
                  setEditing(null);
                  setMessage("");
                }}
              >
                放弃草稿
              </button>
            </div>
          </div>
        )}
        {source === "custom" && !book.tocDraft && book.previousToc && (
          <button
            className="text-button toc-restore"
            onClick={() => {
              onUpdate({
                generatedToc: book.previousToc,
                previousToc: book.generatedToc,
              });
              notify("已恢复上一版目录");
            }}
          >
            <RotateCcw size={13} />
            恢复上一版目录
          </button>
        )}
        {nodes.length > 0 && (
          <div className="toc-search">
            <Search size={13} />
            <input
              aria-label="查找目录"
              placeholder="查找章节…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </div>
        )}
        {nodes.length ? (
          <div
            role="tree"
            aria-label={source === "native" ? "PDF 原始目录" : "生成目录树"}
            className="toc-tree"
          >
            {draw(null)}
            {matching?.size === 0 && (
              <p className="toc-message">没有匹配的章节</p>
            )}
          </div>
        ) : (
          !progress && (
            <div className="sidebar-empty toc-empty">
              <List size={27} strokeWidth={1.2} />
              <p>
                {source === "custom" && nativeOutline.length
                  ? "为这本书整理自己的目录"
                  : "这本 PDF 没有内置目录"}
              </p>
              <span>
                从书内目录页或正文标题生成，
                <br />
                也可以手动添加章节。
              </span>
            </div>
          )
        )}
      </div>
      {editing && book.tocDraft && (
        <form
          className="toc-editor"
          aria-label="目录条目编辑"
          onSubmit={(e) => {
            e.preventDefault();
            applyEdit();
          }}
        >
          <div>
            <strong>编辑目录条目</strong>
            <button
              type="button"
              className="icon-button"
              title="关闭条目编辑"
              onClick={() => setEditing(null)}
            >
              <X size={14} />
            </button>
          </div>
          <div className="toc-editor-fields">
            <label>
              标题
              <input
                ref={titleInputRef}
                aria-label="目录标题"
                maxLength={300}
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
              />
            </label>
            <label>
              上级章节
              <select
                aria-label="上级章节"
                value={editParent}
                onChange={(e) => setEditParent(e.target.value)}
              >
                <option value="">顶层章节</option>
                {book.tocDraft.nodes
                  .filter(
                    (n) =>
                      !forbidden.has(n.id) &&
                      tocDepth(book.tocDraft!.nodes, n.id) < 6,
                  )
                  .map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.title}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              PDF 文件页码（留空为待定位）
              <input
                aria-label="目录目标页码"
                inputMode="numeric"
                value={editPage}
                onChange={(e) => setEditPage(e.target.value)}
              />
            </label>
            <button
              type="button"
              className="text-button"
              onClick={() => void bindCurrent()}
            >
              绑定到当前阅读位置
            </button>
          </div>
          <div className="toc-editor-buttons">
            <button
              type="button"
              className="icon-button delete-button"
              title="删除目录条目（保留子项）"
              onClick={removeNode}
            >
              <Trash2 size={14} />
            </button>
            <button className="small-primary" type="submit">
              应用修改
            </button>
          </div>
        </form>
      )}
      {setup && (
        <div className="modal-backdrop">
          <form
            className="settings-modal toc-setup"
            role="dialog"
            aria-modal="true"
            aria-labelledby="toc-setup-title"
            onSubmit={(e) => {
              e.preventDefault();
              void runGeneration();
            }}
          >
            <div className="modal-heading">
              <h2 id="toc-setup-title">生成教材目录</h2>
              <button
                type="button"
                className="icon-button"
                title="关闭生成设置"
                onClick={() => setSetup(false)}
              >
                <X size={18} />
              </button>
            </div>
            <p>在本地分析这本书，生成可编辑的目录草稿。</p>
            <label>
              识别方式
              <select
                aria-label="目录识别方式"
                value={mode}
                onChange={(e) => setMode(e.target.value as TocOptions["mode"])}
              >
                <option value="auto">自动：优先印刷目录，再查正文标题</option>
                <option value="printed">指定印刷目录页</option>
                <option value="headings">仅从正文标题生成</option>
              </select>
            </label>
            {mode === "printed" && (
              <div className="toc-range">
                <label>
                  从文件第
                  <input
                    aria-label="目录起始页"
                    inputMode="numeric"
                    value={start}
                    onChange={(e) => setStart(e.target.value)}
                  />
                </label>
                <label>
                  到第
                  <input
                    aria-label="目录结束页"
                    inputMode="numeric"
                    value={end}
                    onChange={(e) => setEnd(e.target.value)}
                  />
                </label>
                <span>页</span>
              </div>
            )}
            <p className="toc-setup-note">
              会读取正文核对实际页码。扫描图片暂需
              OCR，可先使用手动目录。现有目录不会被直接覆盖。
            </p>
            <div className="setting-buttons">
              <button className="primary-button" type="submit">
                <Sparkles size={15} />
                开始生成
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
