export type TocTarget = { page: number; point?: [number, number] };
export type TocNode = {
  id: string;
  parentId: string | null;
  title: string;
  printedLabel?: string;
  target: TocTarget | null;
  source: "printed-toc" | "body-heading" | "manual";
  review: "verified" | "needs-review" | "unresolved";
  sourcePage: number;
  manuallyEdited: boolean;
};
export type GeneratedToc = {
  schemaVersion: 1;
  analyzerVersion: string;
  documentSignature: string;
  generatedAt: number;
  updatedAt: number;
  nodes: TocNode[];
};
export type TocLine = {
  text: string;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  point: [number, number];
};
export type TocPage = {
  page: number;
  width: number;
  height: number;
  lines: TocLine[];
};
export type TocOptions = {
  mode: "auto" | "printed" | "headings";
  range?: [number, number];
  labels: string[] | null;
  pageOffset: number;
  documentSignature: string;
};
export const TOC_VERSION = "1.0.0";
export const MAX_TOC_NODES = 5000;

export function emptyToc(signature: string): GeneratedToc {
  const now = Date.now();
  return {
    schemaVersion: 1,
    analyzerVersion: TOC_VERSION,
    documentSignature: signature,
    generatedAt: now,
    updatedAt: now,
    nodes: [],
  };
}
export function isSignature(value: unknown): value is string {
  return typeof value === "string" && /^sha256:[a-f0-9]{64}$/.test(value);
}
export function validateToc(
  value: unknown,
  pages: number,
): asserts value is GeneratedToc {
  const fail = () => {
    throw new Error("备份中的自定义目录无效");
  };
  if (!value || typeof value !== "object") return fail();
  const t = value as GeneratedToc;
  if (
    t.schemaVersion !== 1 ||
    typeof t.analyzerVersion !== "string" ||
    t.analyzerVersion.length > 50 ||
    !isSignature(t.documentSignature) ||
    !Number.isFinite(t.generatedAt) ||
    !Number.isFinite(t.updatedAt) ||
    !Array.isArray(t.nodes) ||
    t.nodes.length > MAX_TOC_NODES
  )
    return fail();
  const nodes = new Map<string, TocNode>();
  for (const n of t.nodes) {
    if (
      !n ||
      typeof n.id !== "string" ||
      !n.id ||
      n.id.length > 100 ||
      nodes.has(n.id) ||
      typeof n.title !== "string" ||
      !n.title.trim() ||
      n.title.length > 300 ||
      (n.parentId !== null && typeof n.parentId !== "string") ||
      !Number.isInteger(n.sourcePage) ||
      n.sourcePage < 1 ||
      n.sourcePage > pages ||
      !["printed-toc", "body-heading", "manual"].includes(n.source) ||
      !["verified", "needs-review", "unresolved"].includes(n.review) ||
      typeof n.manuallyEdited !== "boolean" ||
      (n.printedLabel !== undefined &&
        (typeof n.printedLabel !== "string" || n.printedLabel.length > 40))
    )
      return fail();
    if (n.target !== null) {
      if (
        !n.target ||
        !Number.isInteger(n.target.page) ||
        n.target.page < 1 ||
        n.target.page > pages
      )
        return fail();
      const p = n.target.point;
      if (
        p !== undefined &&
        (!Array.isArray(p) ||
          p.length !== 2 ||
          !p.every(
            (v) =>
              typeof v === "number" &&
              Number.isFinite(v) &&
              Math.abs(v) <= 10_000_000,
          ))
      )
        return fail();
    } else if (n.review !== "unresolved") return fail();
    nodes.set(n.id, n);
  }
  for (const node of t.nodes) {
    const seen = new Set([node.id]);
    let parent = node.parentId;
    let depth = 0;
    while (parent !== null) {
      if (seen.has(parent) || !nodes.has(parent) || ++depth > 6) return fail();
      seen.add(parent);
      parent = nodes.get(parent)!.parentId;
    }
  }
}
export function descendants(nodes: TocNode[], id: string): Set<string> {
  const ids = new Set([id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const n of nodes)
      if (n.parentId && ids.has(n.parentId) && !ids.has(n.id)) {
        ids.add(n.id);
        changed = true;
      }
  }
  return ids;
}
export function tocDepth(nodes: TocNode[], id: string): number {
  const map = new Map(nodes.map((n) => [n.id, n]));
  let n = map.get(id),
    depth = 0;
  while (n?.parentId && depth < 7) {
    depth++;
    n = map.get(n.parentId);
  }
  return depth;
}
