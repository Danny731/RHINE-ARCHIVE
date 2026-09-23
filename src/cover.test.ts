import { expect, test } from "vitest";
import { coverKey } from "./cover-cache";
import {
  initialPosition,
  mergeLibraries,
  validateLibrary,
  type Book,
  type Library,
} from "./model";
const book: Book = {
  id: "legacy",
  title: "Book",
  source: "file",
  path: "D:/old.pdf",
  pages: 10,
  opened: 1,
  position: initialPosition(),
  secondary: initialPosition(),
  mode: "continuous",
  split: false,
  pageOffset: 0,
  bookmarks: [],
  marks: [],
};
const lib = (value: Book): Library => ({
  version: 1,
  books: [value],
  dark: false,
});
test("legacy libraries remain valid, cover selection validates actual PDF page numbers", () => {
  expect(validateLibrary(lib(book)).books[0].coverPage).toBeUndefined();
  expect(
    validateLibrary(lib({ ...book, coverPage: 10 })).books[0].coverPage,
  ).toBe(10);
  for (const coverPage of [0, -1, 1.5, 11, NaN])
    expect(() => validateLibrary(lib({ ...book, coverPage }))).toThrow(/封面/);
});
test("merge retains local choices including explicit default reset and imports choices for old records", () => {
  expect(
    mergeLibraries(
      lib({ ...book, coverPage: 1 }),
      lib({ ...book, coverPage: 5 }),
    ).books[0].coverPage,
  ).toBe(1);
  expect(
    mergeLibraries(lib(book), lib({ ...book, coverPage: 5 })).books[0]
      .coverPage,
  ).toBe(5);
});
test("cache identity follows content and page, survives rename and excludes reading position", () => {
  const signed = { ...book, documentSignature: `sha256:${"a".repeat(64)}` };
  expect(coverKey(signed)).toBe(
    coverKey({
      ...signed,
      path: "D:/new.pdf",
      title: "Renamed",
      position: { ...book.position, page: 8 },
    }),
  );
  expect(coverKey(signed)).not.toBe(coverKey({ ...signed, coverPage: 2 }));
  expect(coverKey(signed)).not.toBe(
    coverKey({ ...signed, documentSignature: `sha256:${"b".repeat(64)}` }),
  );
  expect(coverKey(book)).not.toBe(coverKey({ ...book, path: "D:/other.pdf" }));
});
