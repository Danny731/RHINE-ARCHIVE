import { isSignature, validateToc, type GeneratedToc } from "./toc/types";
import { validateWorkspace, type Workspace } from "./workspace";
import { validateInk, type InkStroke } from "./ink";

export type ViewMode = "continuous" | "single" | "spread";
export type ToolMode = "select" | "highlight" | "area" | "pen" | "eraser";
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
  inkStrokes?: InkStroke[];
  documentSignature?: string;
  generatedToc?: GeneratedToc;
  tocDraft?: GeneratedToc;
  previousToc?: GeneratedToc;
  removedAt?: number;
};
export type Collection = { id: string; name: string; bookIds: string[] };
export type Library = {
  version: 1;
  books: Book[];
  dark: boolean;
  collections?: Collection[];
  workspace?: Workspace;
};
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
    if (book.inkStrokes !== undefined) validateInk(book.inkStrokes, book.pages);
    if (
      book.removedAt !== undefined &&
      (!finite(book.removedAt) || book.removedAt < 0)
    )
      throw new Error("备份中的移除时间无效");
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
  if (lib.collections !== undefined) {
    if (!Array.isArray(lib.collections) || lib.collections.length > 1000)
      throw new Error("备份中的合集无效");
    const collectionIds = new Set<string>();
    for (const collection of lib.collections) {
      if (
        !collection ||
        typeof collection.id !== "string" ||
        !collection.id ||
        collection.id.length > 100 ||
        collectionIds.has(collection.id) ||
        typeof collection.name !== "string" ||
        !collection.name.trim() ||
        collection.name.length > 60 ||
        !Array.isArray(collection.bookIds) ||
        collection.bookIds.length > 10000 ||
        new Set(collection.bookIds).size !== collection.bookIds.length ||
        collection.bookIds.some((id) => typeof id !== "string" || !ids.has(id))
      )
        throw new Error("备份中的合集记录或书籍关联无效");
      collectionIds.add(collection.id);
    }
  }
  if (lib.workspace !== undefined) validateWorkspace(lib.workspace, lib.books);
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
            // A backup must not silently unhide books removed on this device.
            removedAt: old.removedAt,
            ...(old.inkStrokes !== undefined || b.inkStrokes !== undefined
              ? {
                  inkStrokes: [
                    ...new Map(
                      [...(b.inkStrokes || []), ...(old.inkStrokes || [])].map(
                        (s) => [s.id, s],
                      ),
                    ).values(),
                  ].sort((a, b) => a.created - b.created),
                }
              : {}),
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
  const collections = new Map(
    (current.collections || []).map((c) => [c.id, c]),
  );
  for (const collection of incoming.collections || []) {
    const old = collections.get(collection.id);
    collections.set(
      collection.id,
      old
        ? {
            ...old,
            bookIds: [...new Set([...old.bookIds, ...collection.bookIds])],
          }
        : collection,
    );
  }
  return {
    ...current,
    books: [...books.values()],
    ...(current.workspace || incoming.workspace
      ? { workspace: current.workspace || incoming.workspace }
      : {}),
    ...(current.collections !== undefined || incoming.collections !== undefined
      ? { collections: [...collections.values()] }
      : {}),
  };
}
