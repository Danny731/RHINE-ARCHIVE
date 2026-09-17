import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
} from "react";
import {
  TextLayer,
  type PDFDocumentProxy,
  type PDFPageProxy,
  type RenderTask,
} from "pdfjs-dist";
type PageViewport = ReturnType<PDFPageProxy["getViewport"]>;
import {
  ChevronLeft,
  ChevronRight,
  Minus,
  Plus,
  RotateCw,
  Maximize,
  Columns2,
} from "lucide-react";
import {
  clampPage,
  printedPage,
  resolvePage,
  type Mark,
  type PdfRect,
  type ReadingPosition,
  type ToolMode,
  type ViewMode,
} from "./model";
import { destinationPage, pageSizeOf } from "./pdf";

const pageUsers = new WeakMap<PDFPageProxy, number>();
function retainPage(page: PDFPageProxy) {
  pageUsers.set(page, (pageUsers.get(page) || 0) + 1);
}
function releasePage(page: PDFPageProxy) {
  const n = Math.max(0, (pageUsers.get(page) || 1) - 1);
  pageUsers.set(page, n);
  if (!n) page.cleanup();
}
type PageProps = {
  pdf: PDFDocumentProxy;
  number: number;
  width: number;
  zoom: number;
  rotation: number;
  active: boolean;
  tool: ToolMode;
  marks: Mark[];
  search: string;
  onMark: (
    page: number,
    rects: PdfRect[],
    quote: string,
    kind: "highlight" | "area",
  ) => void;
  onJump: (page: number) => void;
  onFocusMark: (id: string) => void;
};
function Page({
  pdf,
  number,
  width,
  zoom,
  rotation,
  active,
  tool,
  marks,
  search,
  onMark,
  onJump,
  onFocusMark,
}: PageProps) {
  const holder = useRef<HTMLDivElement>(null);
  const canvasHost = useRef<HTMLDivElement>(null);
  const text = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(() => pageSizeOf(pdf, number));
  const [viewport, setViewport] = useState<PageViewport | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [links, setLinks] = useState<{ rect: PdfRect; dest: unknown }[]>([]);
  const [drag, setDrag] = useState<[number, number, number, number] | null>(
    null,
  );
  const drawing = useRef<[number, number] | null>(null);
  const scale =
    zoom ||
    Math.min(
      2,
      Math.max(
        0.15,
        (width - 48) / (rotation % 180 ? size.height : size.width),
      ),
    );
  const pageWidth = (rotation % 180 ? size.height : size.width) * scale;
  const pageHeight = (rotation % 180 ? size.width : size.height) * scale;

  useEffect(() => {
    if (!active) {
      setReady(false);
      return;
    }
    let cancelled = false;
    let renderTask: RenderTask | undefined;
    let layer: TextLayer | undefined;
    let page: PDFPageProxy | undefined;
    const oldCanvas = document.createElement("canvas");
    oldCanvas.setAttribute("aria-label", `第 ${number} 页`);
    canvasHost.current?.replaceChildren(oldCanvas);
    setError("");
    setReady(false);
    const work = (async () => {
      page = await pdf.getPage(number);
      retainPage(page);
      if (cancelled || !oldCanvas || !text.current) return;
      const base = page.getViewport({ scale: 1 });
      if (base.width !== size.width || base.height !== size.height) {
        setSize({ width: base.width, height: base.height });
        return;
      }
      const vp = page.getViewport({
        scale,
        rotation: (page.rotate + rotation) % 360,
      });
      // Use the page's intrinsic rotation when sizing pages such as landscape scans.
      setViewport(vp);
      const dpr = Math.min(
        window.devicePixelRatio || 1,
        2,
        Math.sqrt(12_000_000 / (vp.width * vp.height)),
      );
      oldCanvas.width = Math.floor(vp.width * dpr);
      oldCanvas.height = Math.floor(vp.height * dpr);
      renderTask = page.render({
        canvas: oldCanvas,
        viewport: vp,
        transform: dpr === 1 ? undefined : [dpr, 0, 0, dpr, 0, 0],
      });
      await renderTask.promise;
      if (cancelled || !text.current) return;
      text.current.replaceChildren();
      layer = new TextLayer({
        textContentSource: page.streamTextContent(),
        container: text.current,
        viewport: vp,
      });
      await layer.render();
      const annotations = await page.getAnnotations();
      if (cancelled) return;
      setLinks(
        annotations
          .filter((a) => a.subtype === "Link" && a.dest && a.rect)
          .map((a) => ({ rect: a.rect as PdfRect, dest: a.dest })),
      );
      setReady(true);
    })();
    work.catch((e) => {
      if (!cancelled && e?.name !== "RenderingCancelledException")
        setError("此页暂时无法显示，请尝试重新打开文件。");
    });
    return () => {
      cancelled = true;
      renderTask?.cancel();
      layer?.cancel();
      void work
        .catch(() => {})
        .finally(() => {
          if (page) releasePage(page);
          if (oldCanvas) {
            oldCanvas.width = 0;
            oldCanvas.height = 0;
          }
        });
    };
  }, [pdf, number, active, scale, rotation, size.width, size.height]);

  useEffect(() => {
    if (!ready || !text.current) return;
    const query = search.trim().toLocaleLowerCase();
    text.current
      .querySelectorAll("span")
      .forEach((el) =>
        el.classList.toggle(
          "search-hit",
          !!query && !!el.textContent?.toLocaleLowerCase().includes(query),
        ),
      );
  }, [search, ready]);

  function pageRect(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
  ): PdfRect | null {
    if (!viewport || !holder.current) return null;
    const b = holder.current.getBoundingClientRect();
    const p1 = viewport.convertToPdfPoint(
      ((x1 - b.left) * viewport.width) / b.width,
      ((y1 - b.top) * viewport.height) / b.height,
    );
    const p2 = viewport.convertToPdfPoint(
      ((x2 - b.left) * viewport.width) / b.width,
      ((y2 - b.top) * viewport.height) / b.height,
    );
    return [p1[0], p1[1], p2[0], p2[1]];
  }
  function highlight() {
    if (tool !== "highlight" || !holder.current || !ready) return;
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.rangeCount) return;
    const range = selection.getRangeAt(0);
    const bounds = holder.current.getBoundingClientRect();
    const rects = [...range.getClientRects()]
      .filter(
        (r) =>
          r.width > 1 &&
          r.height > 1 &&
          r.top >= bounds.top - 1 &&
          r.bottom <= bounds.bottom + 1 &&
          r.left >= bounds.left - 1 &&
          r.right <= bounds.right + 1,
      )
      .map((r) => pageRect(r.left, r.top, r.right, r.bottom))
      .filter((r): r is PdfRect => !!r);
    if (rects.length) onMark(number, rects, selection.toString(), "highlight");
    selection.removeAllRanges();
  }
  function point(e: PointerEvent) {
    const b = holder.current!.getBoundingClientRect();
    return [
      Math.min(b.width, Math.max(0, e.clientX - b.left)),
      Math.min(b.height, Math.max(0, e.clientY - b.top)),
    ] as [number, number];
  }
  function areaStart(e: PointerEvent) {
    if (tool !== "area" || !ready) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = point(e);
    setDrag([...drawing.current, ...drawing.current]);
  }
  function areaMove(e: PointerEvent) {
    if (drawing.current) setDrag([...drawing.current, ...point(e)]);
  }
  function areaEnd(e: PointerEvent) {
    if (!drawing.current || !holder.current) return;
    const [x, y] = drawing.current;
    const [ex, ey] = point(e);
    drawing.current = null;
    setDrag(null);
    const b = holder.current.getBoundingClientRect();
    if (Math.abs(ex - x) < 5 || Math.abs(ey - y) < 5) return;
    const rect = pageRect(b.left + x, b.top + y, b.left + ex, b.top + ey);
    if (rect) onMark(number, [rect], "", "area");
  }
  function rectStyle(rect: PdfRect): CSSProperties {
    if (!viewport) return {};
    const [x1, y1] = viewport.convertToViewportPoint(rect[0], rect[1]);
    const [x2, y2] = viewport.convertToViewportPoint(rect[2], rect[3]);
    return {
      left: `${(Math.min(x1, x2) / viewport.width) * 100}%`,
      top: `${(Math.min(y1, y2) / viewport.height) * 100}%`,
      width: `${(Math.abs(x2 - x1) / viewport.width) * 100}%`,
      height: `${(Math.abs(y2 - y1) / viewport.height) * 100}%`,
    };
  }
  const actualWidth = pageWidth;
  const actualHeight = pageHeight;
  return (
    <div className="page-wrap" data-page={number}>
      <div
        ref={holder}
        className={`pdf-page tool-${tool}`}
        style={
          {
            width: actualWidth,
            height: actualHeight,
            "--scale-factor": scale,
            "--total-scale-factor": scale * (viewport?.userUnit || 1),
          } as CSSProperties
        }
        onMouseUp={highlight}
      >
        {active && (
          <>
            <div className="canvas-host" ref={canvasHost} />
            <div ref={text} className="textLayer" />
            <div className="mark-layer">
              {marks
                .filter((m) => m.page === number)
                .flatMap((m) =>
                  m.rects.map((r, i) => (
                    <button
                      key={`${m.id}-${i}`}
                      title={m.note || m.quote || "区域标注"}
                      className={`pdf-mark ${m.kind}`}
                      style={rectStyle(r)}
                      onClick={() => onFocusMark(m.id)}
                    />
                  )),
                )}
            </div>
            {tool === "select" &&
              links.map((l, i) => (
                <button
                  key={i}
                  className="pdf-link"
                  aria-label="跳转到文内引用"
                  style={rectStyle(l.rect)}
                  onClick={() =>
                    void destinationPage(pdf, l.dest)
                      .then((p) => p && onJump(p))
                      .catch(() => {})
                  }
                />
              ))}
            {tool === "area" && (
              <div
                className="area-layer"
                onPointerDown={areaStart}
                onPointerMove={areaMove}
                onPointerUp={areaEnd}
                onPointerCancel={() => {
                  drawing.current = null;
                  setDrag(null);
                }}
              >
                {drag && (
                  <div
                    className="area-preview"
                    style={{
                      left: Math.min(drag[0], drag[2]),
                      top: Math.min(drag[1], drag[3]),
                      width: Math.abs(drag[2] - drag[0]),
                      height: Math.abs(drag[3] - drag[1]),
                    }}
                  />
                )}
              </div>
            )}
          </>
        )}
        {!ready && (
          <div className="page-placeholder">{error || `第 ${number} 页`}</div>
        )}
      </div>
      <span className="page-caption">{number}</span>
    </div>
  );
}

type ReaderProps = {
  pdf: PDFDocumentProxy;
  position: ReadingPosition;
  mode: ViewMode;
  marks: Mark[];
  tool: ToolMode;
  labels: string[] | null;
  pageOffset: number;
  search: string;
  jumpTicket: number;
  secondary?: boolean;
  onPosition: (p: ReadingPosition) => void;
  onNavigate: (page: number) => void;
  onMark: PageProps["onMark"];
  onFocusMark: (id: string) => void;
};
export default function Reader({
  pdf,
  position,
  mode,
  marks,
  tool,
  labels,
  pageOffset,
  search,
  jumpTicket,
  secondary,
  onPosition,
  onNavigate,
  onMark,
  onFocusMark,
}: ReaderProps) {
  const scroller = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(700);
  const [active, setActive] = useState<Set<number>>(new Set([position.page]));
  const [pageInput, setPageInput] = useState("");
  const [pageError, setPageError] = useState(false);
  const pos = useRef(position);
  pos.current = position;
  const onPos = useRef(onPosition);
  onPos.current = onPosition;
  const scrollTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const restored = useRef(false);
  useEffect(() => {
    setPageInput(printedPage(position.page, pageOffset, labels));
    setPageError(false);
  }, [position.page, pageOffset, labels]);
  useEffect(() => {
    if (!scroller.current) return;
    const ro = new ResizeObserver((e) => setWidth(e[0].contentRect.width));
    ro.observe(scroller.current);
    return () => ro.disconnect();
  }, []);
  const pages =
    mode === "continuous"
      ? Array.from({ length: pdf.numPages }, (_, i) => i + 1)
      : mode === "spread"
        ? [
            position.page,
            ...(position.page < pdf.numPages ? [position.page + 1] : []),
          ]
        : [position.page];
  const pageKey = mode === "continuous" ? "all" : pages.join(",");
  useEffect(() => {
    const root = scroller.current;
    if (!root) return;
    const visible = new Set<number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const n = Number((e.target as HTMLElement).dataset.page);
          if (e.isIntersecting) visible.add(n);
          else visible.delete(n);
        }
        setActive(new Set(visible));
      },
      { root, rootMargin: "700px 200px", threshold: 0 },
    );
    root.querySelectorAll(".page-wrap").forEach((p) => observer.observe(p));
    return () => observer.disconnect();
  }, [pdf, pageKey, mode, width]);
  useLayoutEffect(() => {
    const root = scroller.current;
    if (!root) return;
    restored.current = false;
    if (scrollTimer.current) clearTimeout(scrollTimer.current);
    const target = { ...pos.current };
    const el = root.querySelector<HTMLElement>(`[data-page="${target.page}"]`);
    if (el) {
      root.scrollTop = el.offsetTop + target.offset * el.offsetHeight - 24;
      root.scrollLeft = 0;
    }
    const frame = requestAnimationFrame(() => {
      restored.current = true;
    });
    return () => cancelAnimationFrame(frame);
  }, [pdf, jumpTicket, mode, width, position.zoom, position.rotation]);
  useEffect(
    () => () => {
      if (scrollTimer.current) clearTimeout(scrollTimer.current);
    },
    [],
  );
  function measureScroll() {
    const root = scroller.current;
    if (!root || !restored.current) return;
    const top = root.scrollTop + 40;
    const elements = [...root.querySelectorAll<HTMLElement>(".page-wrap")];
    let found = elements[0];
    for (const el of elements) {
      if (el.offsetTop <= top) found = el;
      else break;
    }
    if (!found) return;
    const next = {
      ...pos.current,
      page: mode === "spread" ? pos.current.page : Number(found.dataset.page),
      offset: Math.max(
        0,
        Math.min(
          1,
          (root.scrollTop - found.offsetTop + 24) / found.offsetHeight,
        ),
      ),
    };
    if (
      next.page !== pos.current.page ||
      Math.abs(next.offset - pos.current.offset) > 0.002
    )
      onPos.current(next);
  }
  function onScroll() {
    if (!restored.current) return;
    if (scrollTimer.current) clearTimeout(scrollTimer.current);
    scrollTimer.current = setTimeout(measureScroll, 100);
  }
  function submitPage() {
    const p = resolvePage(pageInput, pdf.numPages, pageOffset, labels);
    if (p) onNavigate(p);
    else setPageError(true);
  }
  const zoomLabel = position.zoom
    ? `${Math.round(position.zoom * 100)}%`
    : "适合宽度";
  return (
    <section
      className={`reader-pane ${secondary ? "secondary" : ""}`}
      aria-label={secondary ? "对照阅读区" : "主阅读区"}
    >
      <div className="pane-toolbar">
        {secondary && (
          <span className="compare-label">
            <Columns2 size={14} />
            对照
          </span>
        )}
        <button
          className="icon-button"
          title="上一页"
          aria-label={secondary ? "对照上一页" : "上一页"}
          disabled={position.page <= 1}
          onClick={() =>
            onNavigate(
              clampPage(
                position.page - (mode === "spread" ? 2 : 1),
                pdf.numPages,
              ),
            )
          }
        >
          <ChevronLeft size={17} />
        </button>
        <form
          className="page-control"
          onSubmit={(e) => {
            e.preventDefault();
            submitPage();
          }}
        >
          <input
            aria-label={secondary ? "对照页码" : "页码"}
            className={pageError ? "invalid" : ""}
            value={pageInput}
            onChange={(e) => setPageInput(e.target.value)}
            onBlur={() => {
              if (pageError) {
                setPageInput(printedPage(position.page, pageOffset, labels));
                setPageError(false);
              }
            }}
          />
          <span title="PDF 文件总页数">/ {pdf.numPages}</span>
        </form>
        <button
          className="icon-button"
          title="下一页"
          aria-label={secondary ? "对照下一页" : "下一页"}
          disabled={position.page >= pdf.numPages}
          onClick={() =>
            onNavigate(
              clampPage(
                position.page + (mode === "spread" ? 2 : 1),
                pdf.numPages,
              ),
            )
          }
        >
          <ChevronRight size={17} />
        </button>
        <span className="toolbar-divider" />
        <button
          className="icon-button"
          title="缩小"
          aria-label={secondary ? "对照缩小" : "缩小"}
          onClick={() =>
            onPosition({
              ...position,
              zoom: Math.max(0.25, (position.zoom || 1) - 0.1),
            })
          }
        >
          <Minus size={15} />
        </button>
        <button
          className="zoom-button"
          title="点击适合宽度"
          onClick={() => onPosition({ ...position, zoom: 0 })}
        >
          {zoomLabel}
        </button>
        <button
          className="icon-button"
          title="放大"
          aria-label={secondary ? "对照放大" : "放大"}
          onClick={() =>
            onPosition({
              ...position,
              zoom: Math.min(3, (position.zoom || 1) + 0.1),
            })
          }
        >
          <Plus size={15} />
        </button>
        <button
          className="icon-button optional-tool"
          title="适合宽度"
          onClick={() => onPosition({ ...position, zoom: 0 })}
        >
          <Maximize size={15} />
        </button>
        <button
          className="icon-button optional-tool"
          title="旋转页面"
          onClick={() =>
            onPosition({
              ...position,
              rotation: (position.rotation + 90) % 360,
            })
          }
        >
          <RotateCw size={15} />
        </button>
      </div>
      <div
        className={`reader-scroll mode-${mode}`}
        ref={scroller}
        onScroll={onScroll}
      >
        <div className="page-stack">
          {pages.map((n) => (
            <Page
              key={`${pdf.fingerprints[0]}-${n}`}
              pdf={pdf}
              number={n}
              width={mode === "spread" ? width / 2 : width}
              zoom={position.zoom}
              rotation={position.rotation}
              active={active.has(n)}
              tool={tool}
              marks={marks}
              search={search}
              onMark={onMark}
              onJump={onNavigate}
              onFocusMark={onFocusMark}
            />
          ))}
        </div>
      </div>
      <div className="pane-footer">
        <span>
          文件第 {position.page} 页
          {(pageOffset !== 0 || labels) &&
            ` · 书页 ${printedPage(position.page, pageOffset, labels)}`}
        </span>
        <span>
          {tool === "highlight"
            ? "拖选文字即可高亮"
            : tool === "area"
              ? "拖动框选图表或扫描文字"
              : "选择文字 · Ctrl + C 复制"}
        </span>
      </div>
    </section>
  );
}

function Thumbnail({
  pdf,
  page,
  current,
  onNavigate,
}: {
  pdf: PDFDocumentProxy;
  page: number;
  current: boolean;
  onNavigate: (p: number) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [height, setHeight] = useState(155);
  useEffect(() => {
    const node = host.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => setVisible(entries[0].isIntersecting),
      { root: node.closest(".sidebar-content"), rootMargin: "200px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!visible || !host.current) return;
    const canvas = document.createElement("canvas");
    host.current.replaceChildren(canvas);
    let cancelled = false;
    let task: RenderTask | undefined;
    let pdfPage: PDFPageProxy | undefined;
    const work = (async () => {
      pdfPage = await pdf.getPage(page);
      retainPage(pdfPage);
      if (cancelled) return;
      const original = pdfPage.getViewport({ scale: 1 });
      const viewport = pdfPage.getViewport({ scale: 120 / original.width });
      setHeight(viewport.height);
      canvas.width = Math.ceil(viewport.width * 1.5);
      canvas.height = Math.ceil(viewport.height * 1.5);
      task = pdfPage.render({
        canvas,
        viewport,
        transform: [1.5, 0, 0, 1.5, 0, 0],
      });
      await task.promise;
    })();
    void work.catch(() => {});
    return () => {
      cancelled = true;
      task?.cancel();
      void work
        .catch(() => {})
        .finally(() => {
          canvas.width = 0;
          canvas.height = 0;
          if (pdfPage) releasePage(pdfPage);
        });
    };
  }, [pdf, page, visible]);
  return (
    <button
      className={`thumbnail ${current ? "current" : ""}`}
      onClick={() => onNavigate(page)}
      aria-label={`跳到第 ${page} 页`}
    >
      <div ref={host} style={{ height }} />
      <span>{page}</span>
    </button>
  );
}
export function Thumbnails({
  pdf,
  current,
  onNavigate,
}: {
  pdf: PDFDocumentProxy;
  current: number;
  onNavigate: (p: number) => void;
}) {
  return (
    <div className="thumbnails">
      {Array.from({ length: pdf.numPages }, (_, i) => (
        <Thumbnail
          key={i}
          pdf={pdf}
          page={i + 1}
          current={current === i + 1}
          onNavigate={onNavigate}
        />
      ))}
    </div>
  );
}
