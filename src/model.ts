import { isSignature, validateToc, type GeneratedToc } from "./toc/types";

export type ViewMode = "continuous" | "single" | "spread";
export type ToolMode = "select" | "highlight" | "area";
export type PdfRect = [number, number, number, number];
export type Mark = {
  id: string;
  page: number;
  kind: "highlight" | "area" | "note";
  rects: PdfRect[];
  quote: string;
  note: string;
  created: number;
};
export type Bookmark = { id: string; page: number; title: string };
export type ReadingPosition = {
  page: number;
  offset: number;
  zoom: number;
  rotation: number;
};
export type Book = {
  id: string;
  title: string;
  path?: string;
  source: "file" | "demo";
  pages: number;
  opened: number;
  position: ReadingPosition;
  secondary: ReadingPosition;
  mode: ViewMode;
  split: boolean;
  pageOffset: number;
  bookmarks: Bookmark[];
  marks: Mark[];
  documentSignature?: string;
  generatedToc?: GeneratedToc;
  tocDraft?: GeneratedToc;
  previousToc?: GeneratedToc;
};
export type Library = { version: 1; books: Book[]; dark: boolean };
export const emptyLibrary = (): Library => ({
  version: 1,
  books: [],
  dark: false,
});
export const initialPosition = (): ReadingPosition => ({
  page: 1,
  offset: 0,
  zoom: 0,
  rotation: 0,
});
export function clampPage(page: number, total: number) {
  return Math.min(total, Math.max(1, Math.round(page) || 1));
}
export function printedPage(
  page: number,
  offset: number,
  labels: string[] | null,
) {
  return offset !== 0
    ? String(page - offset)
    : labels?.[page - 1] || String(page);
}
export function resolvePage(
  input: string,
  total: number,
  offset: number,
  labels: string[] | null,
) {
  const text = input.trim();
  if (!text) return null;
  if (offset === 0 && labels) {
    const found = labels.indexOf(text);
    if (found >= 0) return found + 1;
  }
  if (!/^\d+$/.test(text)) return null;
  const page = Number(text) + offset;
  return page >= 1 && page <= total ? page : null;
}
function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
function validPosition(v: unknown, pages: number): boolean {
  if (!v || typeof v !== "object") return false;
  const p = v as ReadingPosition;
  return (
    Number.isInteger(p.page) &&
    p.page >= 1 &&
    p.page <= pages &&
    finite(p.offset) &&
    p.offset >= 0 &&
    p.offset <= 1 &&
    finite(p.zoom) &&
    (p.zoom === 0 || (p.zoom >= 0.25 && p.zoom <= 3)) &&
    [0, 90, 180, 270].includes(p.rotation)
  );
}
export function validateLibrary(value: unknown): Library {
  if (!value || typeof value !== "object") throw new Error("备份格式不正确");
  const lib = value as Library;
  if (
    lib.version !== 1 ||
    !Array.isArray(lib.books) ||
    typeof lib.dark !== "boolean" ||
    lib.books.length > 10000
  )
    throw new Error("不支持的备份格式或版本");
  const ids = new Set<string>();
  for (const book of lib.books) {
    if (
      !book ||
      typeof book.id !== "string" ||
      !book.id ||
      ids.has(book.id) ||
      typeof book.title !== "string" ||
      (book.path !== undefined && typeof book.path !== "string") ||
      !["file", "demo"].includes(book.source) ||
      !Number.isInteger(book.pages) ||
      book.pages < 1 ||
      !finite(book.opened) ||
      !validPosition(book.position, book.pages) ||
      !validPosition(book.secondary, book.pages) ||
      !["continuous", "single", "spread"].includes(book.mode) ||
      typeof book.split !== "boolean" ||
      !Number.isInteger(book.pageOffset) ||
      !Array.isArray(book.bookmarks) ||
      !Array.isArray(book.marks)
    )
      throw new Error("备份中的书籍记录损坏");
    ids.add(book.id);
    if (
      book.documentSignature !== undefined &&
      !isSignature(book.documentSignature)
    )
      throw new Error("备份中的文档签名无效");
    for (const toc of [book.generatedToc, book.tocDraft, book.previousToc])
      if (toc !== undefined) validateToc(toc, book.pages);
    for (const b of book.bookmarks)
      if (
        !b ||
        typeof b.id !== "string" ||
        typeof b.title !== "string" ||
        !Number.isInteger(b.page) ||
        b.page < 1 ||
        b.page > book.pages
      )
        throw new Error("备份中的书签无效");
    for (const m of book.marks)
      if (
        !m ||
        typeof m.id !== "string" ||
        !Number.isInteger(m.page) ||
        m.page < 1 ||
        m.page > book.pages ||
        !["highlight", "area", "note"].includes(m.kind) ||
        typeof m.quote !== "string" ||
        typeof m.note !== "string" ||
        !finite(m.created) ||
        !Array.isArray(m.rects) ||
        m.rects.some(
          (r) => !Array.isArray(r) || r.length !== 4 || !r.every(finite),
        )
      )
        throw new Error("备份中的标注无效");
  }
  return lib;
}
export function mergeLibraries(current: Library, incoming: Library): Library {
  const books = new Map(current.books.map((b) => [b.id, b]));
  for (const b of incoming.books) {
    const old = books.get(b.id);
    if (
      old &&
      (old.pages !== b.pages ||
        (old.documentSignature &&
          b.documentSignature &&
          old.documentSignature !== b.documentSignature))
    ) {
      throw new Error(
        "备份包含与本机内容不同的同名文档版本，请分别保留并恢复，避免目录和标注错位。",
      );
    }
    books.set(
      b.id,
      old
        ? {
            ...(old.opened >= b.opened ? old : b),
            path: old.path || b.path,
            documentSignature: old.documentSignature || b.documentSignature,
            generatedToc: old.generatedToc || b.generatedToc,
            tocDraft: old.tocDraft || b.tocDraft,
            previousToc: old.previousToc || b.previousToc,
            bookmarks: [
              ...new Map(
                [...b.bookmarks, ...old.bookmarks].map((m) => [m.id, m]),
              ).values(),
            ],
            marks: [
              ...new Map(
                [...b.marks, ...old.marks].map((m) => [m.id, m]),
              ).values(),
            ],
          }
        : b,
    );
  }
  return { ...current, books: [...books.values()] };
}
