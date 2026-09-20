export type InkPoint = [number, number];
export type InkStroke = {
  id: string;
  page: number;
  color: string;
  width: number;
  points: InkPoint[];
  created: number;
};
export type InkChange = { added: InkStroke[]; removed: InkStroke[] };
export type PenStyle = { color: string; width: number };

export function validateInk(
  value: unknown,
  pages: number,
): asserts value is InkStroke[] {
  if (!Array.isArray(value)) throw new Error("备份中的手写笔迹无效");
  const ids = new Set<string>();
  for (const s of value) {
    if (
      !s ||
      typeof s.id !== "string" ||
      !s.id ||
      ids.has(s.id) ||
      !Number.isInteger(s.page) ||
      s.page < 1 ||
      s.page > pages ||
      typeof s.color !== "string" ||
      !/^#[0-9a-f]{6}$/i.test(s.color) ||
      !Number.isFinite(s.width) ||
      s.width < 0.25 ||
      s.width > 24 ||
      !Number.isFinite(s.created) ||
      !Array.isArray(s.points) ||
      !s.points.length ||
      s.points.length > 50000 ||
      s.points.some(
        (p: unknown) =>
          !Array.isArray(p) ||
          p.length !== 2 ||
          !p.every((n: unknown) => typeof n === "number" && Number.isFinite(n)),
      )
    )
      throw new Error("备份中的手写笔迹无效");
    ids.add(s.id);
  }
}

function distance(p: InkPoint, a: InkPoint, b: InkPoint) {
  const dx = b[0] - a[0],
    dy = b[1] - a[1];
  const t =
    dx || dy
      ? Math.max(
          0,
          Math.min(
            1,
            ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy),
          ),
        )
      : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}
function cross(a: InkPoint, b: InkPoint, p: InkPoint) {
  return (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
}
export function hitsStroke(
  s: InkStroke,
  from: InkPoint,
  to: InkPoint,
  radius: number,
) {
  const threshold = radius + s.width / 2;
  return s.points.some((a, i) => {
    const b = s.points[Math.max(0, i - 1)];
    // Endpoint distances cover parallel/degenerate lines; strict crossing covers fast drags.
    return (
      Math.min(
        distance(a, from, to),
        distance(b, from, to),
        distance(from, a, b),
        distance(to, a, b),
      ) <= threshold ||
      (cross(from, to, a) * cross(from, to, b) < 0 &&
        cross(a, b, from) * cross(a, b, to) < 0)
    );
  });
}
export function applyInkChange(
  strokes: InkStroke[],
  change: InkChange,
): InkStroke[] {
  const removed = new Set(change.removed.map((s) => s.id));
  const result = new Map(
    strokes.filter((s) => !removed.has(s.id)).map((s) => [s.id, s]),
  );
  for (const s of change.added) result.set(s.id, s);
  return [...result.values()].sort((a, b) => a.created - b.created);
}
export class InkHistory {
  private books = new Map<string, { undo: InkChange[]; redo: InkChange[] }>();
  state(id: string) {
    let state = this.books.get(id);
    if (!state) {
      state = { undo: [], redo: [] };
      this.books.set(id, state);
    }
    return state;
  }
  record(id: string, change: InkChange) {
    const state = this.state(id);
    state.undo.push(change);
    if (state.undo.length > 50) state.undo.shift();
    state.redo = [];
  }
  take(id: string, redo: boolean): InkChange | undefined {
    const state = this.state(id);
    const change = (redo ? state.redo : state.undo).pop();
    if (!change) return;
    (redo ? state.undo : state.redo).push(change);
    return redo ? change : { added: change.removed, removed: change.added };
  }
}
