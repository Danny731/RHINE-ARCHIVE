import {
  useRef,
  useEffect,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { PDFPageProxy } from "pdfjs-dist";
import type { ToolMode } from "../model";
import {
  hitsStroke,
  type InkChange,
  type InkPoint,
  type InkStroke,
  type PenStyle,
} from "../ink";

type Props = {
  viewport: ReturnType<PDFPageProxy["getViewport"]>;
  page: number;
  tool: ToolMode;
  pen: PenStyle;
  strokes: InkStroke[];
  onChange: (change: InkChange) => void;
};
export default function InkLayer({
  viewport,
  page,
  tool,
  pen,
  strokes,
  onChange,
}: Props) {
  const gesture = useRef<{
    pointer: number;
    erase: boolean;
    stroke: InkStroke;
    removed: Set<string>;
  } | null>(null);
  const [draft, setDraft] = useState<InkStroke | null>(null);
  const [removed, setRemoved] = useState(new Set<string>());
  const scale = Math.hypot(viewport.transform[0], viewport.transform[1]);
  const editable = tool === "pen" || tool === "eraser";
  function point(
    e: { clientX: number; clientY: number },
    el: SVGSVGElement,
  ): InkPoint {
    const b = el.getBoundingClientRect();
    return viewport.convertToPdfPoint(
      Math.max(
        0,
        Math.min(
          viewport.width,
          ((e.clientX - b.left) * viewport.width) / b.width,
        ),
      ),
      Math.max(
        0,
        Math.min(
          viewport.height,
          ((e.clientY - b.top) * viewport.height) / b.height,
        ),
      ),
    ) as InkPoint;
  }
  function cancel() {
    gesture.current = null;
    setDraft(null);
    setRemoved(new Set());
  }
  useEffect(() => {
    window.addEventListener("rhine-archive:cancel-ink", cancel);
    return () => window.removeEventListener("rhine-archive:cancel-ink", cancel);
  }, []);
  function collect(e: ReactPointerEvent<SVGSVGElement>) {
    const g = gesture.current;
    if (!g || g.pointer !== e.pointerId) return;
    const samples = e.nativeEvent.getCoalescedEvents?.();
    for (const sample of samples?.length ? samples : [e]) {
      const p = point(sample, e.currentTarget);
      const last = g.stroke.points[g.stroke.points.length - 1];
      if (g.erase) {
        for (const s of strokes)
          if (!g.removed.has(s.id) && hitsStroke(s, last, p, 8 / scale))
            g.removed.add(s.id);
        g.stroke.points = [p];
      } else if (Math.hypot(p[0] - last[0], p[1] - last[1]) * scale >= 0.5) {
        g.stroke.points.push(p);
        // Bound a single exceptionally long gesture without dropping its endpoint.
        if (g.stroke.points.length > 16000)
          g.stroke.points = g.stroke.points.filter((_, i) => i % 2 === 0);
      }
    }
    if (g.erase) setRemoved(new Set(g.removed));
    else setDraft({ ...g.stroke, points: [...g.stroke.points] });
  }
  function start(e: ReactPointerEvent<SVGSVGElement>) {
    if (
      !editable ||
      gesture.current ||
      e.pointerType === "touch" ||
      (e.button !== 0 && e.button !== 5)
    )
      return;
    e.preventDefault();
    e.currentTarget.focus({ preventScroll: true });
    e.currentTarget.setPointerCapture(e.pointerId);
    gesture.current = {
      pointer: e.pointerId,
      erase: tool === "eraser" || e.button === 5,
      removed: new Set(),
      stroke: {
        id: crypto.randomUUID(),
        page,
        ...pen,
        created: Date.now(),
        points: [point(e, e.currentTarget)],
      },
    };
    collect(e);
  }
  function end(e: ReactPointerEvent<SVGSVGElement>) {
    if (gesture.current?.pointer !== e.pointerId) return;
    collect(e);
    const g = gesture.current!;
    const change = {
      added: g.erase ? [] : [g.stroke],
      removed: strokes.filter((s) => g.removed.has(s.id)),
    };
    cancel();
    if (e.currentTarget.hasPointerCapture(e.pointerId))
      e.currentTarget.releasePointerCapture(e.pointerId);
    if (change.added.length || change.removed.length) onChange(change);
  }
  function render(s: InkStroke, preview = false) {
    const points = s.points.map((p) => viewport.convertToViewportPoint(...p));
    const common = { "data-ink-id": preview ? undefined : s.id, fill: s.color };
    if (points.length === 1)
      return (
        <circle
          key={s.id}
          {...common}
          cx={points[0][0]}
          cy={points[0][1]}
          r={(s.width * scale) / 2}
        />
      );
    return (
      <polyline
        key={s.id}
        {...common}
        points={points.map((p) => p.join(",")).join(" ")}
        fill="none"
        stroke={s.color}
        strokeWidth={s.width * scale}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    );
  }
  return (
    <svg
      className={`ink-layer ${editable ? "editable" : ""}`}
      aria-label={`第 ${page} 页手写层`}
      tabIndex={editable ? -1 : undefined}
      viewBox={`0 0 ${viewport.width} ${viewport.height}`}
      onPointerDown={start}
      onPointerMove={collect}
      onPointerUp={end}
      onPointerCancel={(e) => {
        if (gesture.current?.pointer === e.pointerId) cancel();
      }}
      onLostPointerCapture={(e) => {
        if (gesture.current?.pointer === e.pointerId) cancel();
      }}
      onKeyDown={(e) => {
        if (
          e.key === "Escape" ||
          ((e.ctrlKey || e.metaKey) && ["z", "y"].includes(e.key.toLowerCase()))
        )
          cancel();
      }}
    >
      {strokes.filter((s) => !removed.has(s.id)).map((s) => render(s))}
      {draft && render(draft, true)}
    </svg>
  );
}
