import { describe, it, expect } from "vitest";
import { identifyBook } from "./book-identity";
import {
  initialPosition,
  validateLibrary,
  type Book,
  type Library,
} from "./model";

// Synthetic v0.1.0 record: only the fields present in that tag's model.ts.
const legacy: Book = {
  id: "legacy-fingerprint",
  title: "旧版中文教材",
  path: "D:/教材/原文件.pdf",
  source: "file",
  pages: 20,
  opened: 1,
  position: { ...initialPosition(), page: 7, zoom: 1.2, offset: 0.25 },
  secondary: { ...initialPosition(), page: 12 },
  mode: "continuous",
  split: true,
  pageOffset: 3,
  bookmarks: [{ id: "b1", page: 7, title: "习题" }],
  marks: [
    {
      id: "m1",
      page: 7,
      kind: "highlight",
      rects: [[10, 20, 100, 30]],
      quote: "原摘录",
      note: "旧笔记",
      created: 1,
    },
  ],
};
const signature = `sha256:${"a".repeat(64)}`;
const library = (book = legacy): Library => ({
  version: 1,
  books: [book],
  dark: true,
});
describe("backward-compatible book identity", () => {
  it("reads and roundtrips v0.1.0 library without resetting paths or reading data", () => {
    const old = library();
    expect(validateLibrary(JSON.parse(JSON.stringify(old)))).toEqual(old);
    expect(
      identifyBook(old, legacy.id, signature, 20, legacy.id).existing,
    ).toEqual(legacy);
  });
  it("retains legacy ID when a parser update changes fingerprint but bytes are identical", () => {
    const book = { ...legacy, documentSignature: signature };
    expect(
      identifyBook(library(book), "new-parser-fingerprint", signature, 20),
    ).toEqual({ id: legacy.id, existing: book });
    expect(
      identifyBook(
        library(book),
        "new-parser-fingerprint",
        signature,
        20,
        legacy.id,
      ).existing,
    ).toBe(book);
  });
  it("refuses to relink a different PDF even with the same embedded fingerprint", () => {
    const old = library({ ...legacy, documentSignature: signature });
    expect(() =>
      identifyBook(old, legacy.id, `sha256:${"b".repeat(64)}`, 20, legacy.id),
    ).toThrow("不一致");
    expect(() =>
      identifyBook(library(), "different", signature, 20, legacy.id),
    ).toThrow("不一致");
    expect(() =>
      identifyBook(old, legacy.id, signature, 19, legacy.id),
    ).toThrow("不一致");
    expect(old.books[0].path).toBe(legacy.path);
  });
  it("retains optional directory versions and unknown future fields during roundtrip", () => {
    const old = { ...library(), retainedExtension: { revision: 2 } };
    expect(validateLibrary(JSON.parse(JSON.stringify(old)))).toEqual(old);
  });
});
