import { describe, it, expect } from "vitest";
import {
  initialPosition,
  mergeLibraries,
  validateLibrary,
  type Book,
} from "./model";
import {
  activeReaderTab,
  closeReaderTab,
  emptyWorkspace,
  mergeReaderGroups,
  moveReaderTab,
  openReaderTab,
  patchReaderTab,
  selectReaderTab,
  splitReaderTab,
  validateWorkspace,
} from "./workspace";
const book = (id: string): Book => ({
  id,
  title: id,
  source: "file",
  pages: 30,
  opened: 1,
  position: initialPosition(),
  secondary: { ...initialPosition(), page: 2 },
  mode: "continuous",
  split: false,
  pageOffset: 0,
  bookmarks: [],
  marks: [],
});
const books = [book("a"), book("b"), book("c")];
function tabs() {
  let w = emptyWorkspace();
  for (let i = 0; i < books.length; i++)
    w = openReaderTab(w, books[i], `t${i}`, "g");
  return w;
}
describe("tab workspace invariants", () => {
  it("carries legacy same-file split positions into the first workspace", () => {
    const legacy = {
      ...books[0],
      split: true,
      position: { ...initialPosition(), page: 7 },
      secondary: { ...initialPosition(), page: 21 },
    };
    const w = openReaderTab(emptyWorkspace(), legacy, "legacy-tab", "main");
    expect(w.groups).toHaveLength(2);
    expect(w.tabs.map((t) => t.position.page)).toEqual([7, 21]);
    expect(activeReaderTab(w)?.id).toBe("legacy-tab");
    validateWorkspace(w, [legacy]);
  });
  it("opens existing books once and selects their original group", () => {
    const w = splitReaderTab(tabs(), "t0", "horizontal");
    const reopened = openReaderTab(w, books[0], "ignored", "g");
    expect(reopened.tabs).toHaveLength(3);
    expect(activeReaderTab(reopened)?.id).toBe("t0");
    validateWorkspace(reopened, books);
  });
  it("moves/reorders without duplicating IDs and automatically removes empty panes", () => {
    let w = moveReaderTab(tabs(), "t2", "g", "t0");
    expect(w.groups[0].tabs).toEqual(["t2", "t0", "t1"]);
    w = splitReaderTab(w, "t2", "vertical");
    expect(w.groups).toHaveLength(2);
    w = moveReaderTab(w, "t2", "g", "t1");
    expect(w.groups).toHaveLength(1);
    expect(w.groups[0].tabs).toEqual(["t0", "t2", "t1"]);
    validateWorkspace(w, books);
  });
  it("supports two views of one document with independent positions/history and no duplicate drafts", () => {
    let w = openReaderTab(emptyWorkspace(), books[0], "one", "g");
    w = patchReaderTab(w, "one", {
      draft: { text: "pending", page: 1 },
      position: { ...initialPosition(), page: 8 },
    });
    w = splitReaderTab(w, "one", "horizontal");
    const second = activeReaderTab(w)!;
    expect(second.bookId).toBe("a");
    expect(second.id).not.toBe("one");
    expect(second.draft).toBeUndefined();
    w = patchReaderTab(w, second.id, {
      position: { ...initialPosition(), page: 20 },
      history: [second.position],
    });
    expect(w.tabs.find((t) => t.id === "one")?.position.page).toBe(8);
    expect(w.tabs.find((t) => t.id === "one")?.draft?.text).toBe("pending");
    validateWorkspace(w, books);
  });
  it("blocks closing drafts, closes other tabs and retains book records", () => {
    let w = patchReaderTab(tabs(), "t0", { draft: { text: "draft", page: 4 } });
    expect(() => closeReaderTab(w, "t0")).toThrow("草稿");
    w = closeReaderTab(w, "t1");
    w = closeReaderTab(w, "t2");
    expect(w.tabs).toHaveLength(1);
    w = closeReaderTab(patchReaderTab(w, "t0", { draft: undefined }), "t0");
    expect(w.home).toBe(true);
    expect(w.groups).toHaveLength(0);
    validateWorkspace(w, books);
    expect(books).toHaveLength(3);
  });
  it("retains active selection and all tabs when merging groups", () => {
    const w = splitReaderTab(tabs(), "t0", "vertical"),
      id = activeReaderTab(w)!.id;
    const merged = mergeReaderGroups(w);
    expect(merged.groups).toHaveLength(1);
    expect(merged.tabs).toHaveLength(3);
    expect(activeReaderTab(merged)!.id).toBe(id);
    validateWorkspace(merged, books);
  });
  it("roundtrips workspace and preserves local workspace when merging old/new backups", () => {
    const w = patchReaderTab(splitReaderTab(tabs(), "t0", "horizontal"), "t0", {
      draft: { text: "draft", page: 3 },
    });
    const old = { version: 1 as const, books, dark: false },
      current = { ...old, workspace: w };
    expect(validateLibrary(JSON.parse(JSON.stringify(current)))).toEqual(
      current,
    );
    expect(validateLibrary(old).workspace).toBeUndefined();
    expect(mergeLibraries(old, current).workspace).toEqual(w);
    expect(
      mergeLibraries(current, { ...old, workspace: emptyWorkspace() })
        .workspace,
    ).toEqual(w);
  });
  it("rejects broken references, positions, excessive panes and duplicate assignments", () => {
    const w = tabs();
    const invalid: unknown[] = [
      { ...w, ratio: 0 },
      { ...w, tabs: [{ ...w.tabs[0], bookId: "missing" }] },
      { ...w, groups: [{ ...w.groups[0], tabs: ["t0", "t0"] }] },
      { ...w, activeGroupId: "missing" },
      {
        ...w,
        tabs: w.tabs.map((t) => ({
          ...t,
          position: { ...t.position, page: 99 },
        })),
      },
      { ...w, groups: [...w.groups, ...w.groups, ...w.groups] },
      {
        ...w,
        tabs: w.tabs.map((t) => ({ ...t, draft: { page: 99, text: "bad" } })),
      },
    ];
    for (const value of invalid)
      expect(() => validateWorkspace(value, books)).toThrow();
  });
  it("long sequences of rearrangement never orphan or duplicate tabs", () => {
    let w = tabs();
    for (let i = 0; i < 30; i++) {
      const id = w.tabs[i % w.tabs.length].id;
      w = selectReaderTab(w, id);
      w = splitReaderTab(w, id, i % 2 ? "horizontal" : "vertical");
      validateWorkspace(w, books);
      w = mergeReaderGroups(w);
      validateWorkspace(w, books);
    }
  });
});
