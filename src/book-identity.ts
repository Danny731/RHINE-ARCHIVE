import type { Book, Library } from "./model";

// Content signatures survive PDF.js fingerprint algorithm changes. Keep legacy
// IDs unchanged so annotations, outlines and browser file caches remain linked.
export function identifyBook(
  library: Library,
  fingerprint: string,
  signature: string,
  pages: number,
  expectedId?: string,
): { id: string; existing?: Book } {
  if (expectedId) {
    const expected = library.books.find((book) => book.id === expectedId);
    if (!expected) throw new Error("原书架记录不存在，请重新打开书架。");
    const matches = expected.documentSignature
      ? expected.documentSignature === signature
      : expected.id === fingerprint;
    if (!matches || expected.pages !== pages)
      throw new Error(
        "所选 PDF 与原书架记录不一致，未修改原记录。请重新选择原文件；其他版本可通过“打开 PDF”单独打开。",
      );
    return { id: expected.id, existing: expected };
  }
  const sameContent = library.books.find(
    (book) => book.documentSignature === signature && book.pages === pages,
  );
  if (sameContent) return { id: sameContent.id, existing: sameContent };
  const original = library.books.find((book) => book.id === fingerprint);
  const versionId = `${fingerprint}:${signature.slice(-16)}`;
  const existing =
    library.books.find((book) => book.id === versionId) ||
    (original?.pages === pages ? original : undefined);
  return { id: existing?.id || (original ? versionId : fingerprint), existing };
}
