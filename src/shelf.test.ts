import { describe, it, expect } from "vitest";
import {
  initialPosition,
  mergeLibraries,
  validateLibrary,
  type Library,
} from "./model";
import {
  addToCollection,
  assignBook,
  deleteCollection,
  nameCollection,
  removeFromShelf,
  restoreToShelf,
  setCollectionBooks,
} from "./shelf";
const oldLibrary = (): Library => ({
  version: 1,
  dark: false,
  books: [
    {
      id: "pdf-id",
      title: "旧教材",
      path: "D:/教材/书.pdf",
      source: "file",
      pages: 30,
      opened: 1,
      position: { ...initialPosition(), page: 12 },
      secondary: initialPosition(),
      mode: "continuous",
      split: false,
      pageOffset: 0,
      bookmarks: [{ id: "bookmark", page: 12, title: "习题" }],
      marks: [
        {
          id: "note",
          page: 12,
          kind: "note",
          rects: [],
          quote: "",
          note: "旧笔记",
          created: 1,
        },
      ],
    },
  ],
});
describe("collections and reversible shelf removal", () => {
  it("loads a legacy library without collections and retains all reading data when extending it", () => {
    const old = oldLibrary();
    expect(validateLibrary(JSON.parse(JSON.stringify(old)))).toEqual(old);
    const extended = assignBook(nameCollection(old, "c1", " 数学 "), "pdf-id", [
      "c1",
    ]);
    expect(extended.books).toEqual(old.books);
    expect(validateLibrary(JSON.parse(JSON.stringify(extended)))).toEqual(
      extended,
    );
    expect(extended.collections![0]).toEqual({
      id: "c1",
      name: "数学",
      bookIds: ["pdf-id"],
    });
  });
  it("supports multiple collections, avoids duplicate membership and removes only the chosen association", () => {
    let lib = nameCollection(
      nameCollection(oldLibrary(), "a", "数学"),
      "b",
      "复习",
    );
    lib = assignBook(lib, "pdf-id", ["a", "b"]);
    lib = addToCollection(lib, "a", "pdf-id");
    expect(lib.collections!.map((c) => c.bookIds)).toEqual([
      ["pdf-id"],
      ["pdf-id"],
    ]);
    lib = assignBook(lib, "pdf-id", ["b"]);
    expect(lib.collections!.map((c) => c.bookIds)).toEqual([[], ["pdf-id"]]);
    expect(lib.books).toEqual(oldLibrary().books);
  });
  it("rejects empty/long/duplicate names and permits renaming without changing identity", () => {
    const lib = nameCollection(oldLibrary(), "a", "Math");
    expect(() => nameCollection(lib, "b", " math ")).toThrow("同名");
    expect(() => nameCollection(lib, "b", " ")).toThrow();
    expect(() => nameCollection(lib, "b", "x".repeat(61))).toThrow();
    expect(nameCollection(lib, "a", "数学").collections![0].id).toBe("a");
  });
  it("removes reversibly across roundtrip with paths, notes and collection associations intact", () => {
    const original = assignBook(
      nameCollection(oldLibrary(), "a", "数学"),
      "pdf-id",
      ["a"],
    );
    const removed = validateLibrary(
      JSON.parse(JSON.stringify(removeFromShelf(original, "pdf-id", 123))),
    );
    expect(removed.books[0].removedAt).toBe(123);
    expect(removed.books[0].marks).toEqual(original.books[0].marks);
    expect(removed.books[0].path).toBe(original.books[0].path);
    expect(
      JSON.parse(JSON.stringify(restoreToShelf(removed, "pdf-id"))),
    ).toEqual(original);
  });
  it("deletes a collection without deleting any books, including removed entries", () => {
    const lib = assignBook(
      nameCollection(oldLibrary(), "a", "数学"),
      "pdf-id",
      ["a"],
    );
    const removed = removeFromShelf(lib, "pdf-id", 5);
    const deleted = deleteCollection(removed, "a");
    expect(deleted.books).toEqual(removed.books);
    expect(deleted.collections).toEqual([]);
  });
  it("managing visible collection books preserves hidden associations for future recovery", () => {
    const lib = removeFromShelf(
      assignBook(nameCollection(oldLibrary(), "a", "数学"), "pdf-id", ["a"]),
      "pdf-id",
      5,
    );
    expect(setCollectionBooks(lib, "a", []).collections![0].bookIds).toEqual([
      "pdf-id",
    ]);
  });
  it("merges backup collections and preserves local names and removal decisions", () => {
    const current = removeFromShelf(
      assignBook(nameCollection(oldLibrary(), "a", "本机合集"), "pdf-id", [
        "a",
      ]),
      "pdf-id",
      5,
    );
    const incoming = nameCollection(
      nameCollection(oldLibrary(), "a", "旧名称"),
      "b",
      "导入合集",
    );
    incoming.books.push({ ...incoming.books[0], id: "other" });
    incoming.collections![0].bookIds.push("other");
    incoming.collections![1].bookIds.push("pdf-id");
    const merged = validateLibrary(mergeLibraries(current, incoming));
    expect(merged.books[0].removedAt).toBe(5);
    expect(merged.collections).toEqual([
      { id: "a", name: "本机合集", bookIds: ["pdf-id", "other"] },
      { id: "b", name: "导入合集", bookIds: ["pdf-id"] },
    ]);
    expect(mergeLibraries(merged, oldLibrary()).collections).toEqual(
      merged.collections,
    );
    expect(
      mergeLibraries(oldLibrary(), current).books[0].removedAt,
    ).toBeUndefined();
  });
  it("rejects malformed metadata without changing old data", () => {
    const lib = oldLibrary();
    for (const collections of [
      null,
      [{ id: "a", name: "", bookIds: [] }],
      [{ id: "a", name: "数学", bookIds: ["missing"] }],
      [{ id: "a", name: "数学", bookIds: ["pdf-id", "pdf-id"] }],
      [
        { id: "a", name: "数学", bookIds: [] },
        { id: "a", name: "复习", bookIds: [] },
      ],
    ])
      expect(() => validateLibrary({ ...lib, collections })).toThrow();
    expect(() =>
      validateLibrary({ ...lib, books: [{ ...lib.books[0], removedAt: -1 }] }),
    ).toThrow();
    expect(lib).toEqual(oldLibrary());
  });
});
