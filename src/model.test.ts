import { describe, it, expect } from "vitest";
import {
  resolvePage,
  printedPage,
  mergeLibraries,
  validateLibrary,
  initialPosition,
  type Book,
} from "./model";
const book: Book = {
  id: "abc",
  title: "教材",
  pages: 20,
  opened: 1,
  source: "file",
  position: initialPosition(),
  secondary: initialPosition(),
  mode: "continuous",
  split: false,
  pageOffset: 0,
  bookmarks: [],
  marks: [],
};
describe("textbook page labels", () => {
  it("uses embedded roman page labels and custom printed page offsets", () => {
    expect(resolvePage("iv", 20, 0, ["i", "ii", "iii", "iv"])).toBe(4);
    expect(resolvePage("1", 20, 5, null)).toBe(6);
    expect(printedPage(6, 5, null)).toBe("1");
    expect(resolvePage("100", 20, 5, null)).toBeNull();
    expect(resolvePage("1.5", 20, 0, null)).toBeNull();
  });
});
describe("backup safety", () => {
  it("rejects bad versions, invalid positions, duplicate identities and broken mark rectangles", () => {
    expect(() =>
      validateLibrary({ version: 2, books: [], dark: false }),
    ).toThrow();
    expect(() =>
      validateLibrary({
        version: 1,
        books: [{ ...book, position: { ...initialPosition(), page: 100 } }],
        dark: false,
      }),
    ).toThrow();
    expect(() =>
      validateLibrary({ version: 1, books: [book, book], dark: false }),
    ).toThrow();
    expect(() =>
      validateLibrary({
        version: 1,
        books: [
          {
            ...book,
            marks: [
              {
                id: "1",
                page: 1,
                kind: "area",
                rects: [[0, 0]],
                quote: "",
                note: "",
                created: 1,
              },
            ],
          },
        ],
        dark: false,
      }),
    ).toThrow();
  });
  it("merges annotations while preserving current notes and local paths", () => {
    const mark = {
      id: "m1",
      page: 1,
      kind: "note" as const,
      rects: [],
      quote: "",
      note: "new note",
      created: 1,
    };
    const current = {
      version: 1 as const,
      dark: false,
      books: [{ ...book, path: "C:/book.pdf", marks: [mark] }],
    };
    const backup = {
      version: 1 as const,
      dark: false,
      books: [
        {
          ...book,
          path: "D:/old.pdf",
          marks: [
            { ...mark, note: "old note" },
            { ...mark, id: "m2" },
          ],
        },
      ],
    };
    const merged = mergeLibraries(current, backup);
    expect(merged.books).toHaveLength(1);
    expect(merged.books[0].marks).toHaveLength(2);
    expect(merged.books[0].marks.find((m) => m.id === "m1")?.note).toBe(
      "new note",
    );
    expect(merged.books[0].path).toBe("C:/book.pdf");
  });
});
