import type { Book, ReadingPosition, ViewMode } from "./model";

export type ReaderTab = {
  id: string;
  bookId: string;
  position: ReadingPosition;
  mode: ViewMode;
  history: ReadingPosition[];
  query: string;
  draft?: { text: string; page: number };
};
export type TabGroup = { id: string; tabs: string[]; activeTabId: string };
export type Workspace = {
  version: 1;
  tabs: ReaderTab[];
  groups: TabGroup[];
  activeGroupId: string;
  orientation: "horizontal" | "vertical";
  ratio: number;
  home: boolean;
};
export const emptyWorkspace = (): Workspace => ({
  version: 1,
  tabs: [],
  groups: [],
  activeGroupId: "",
  orientation: "horizontal",
  ratio: 0.5,
  home: true,
});
export const activeReaderTab = (w: Workspace) =>
  w.tabs.find(
    (t) => t.id === w.groups.find((g) => g.id === w.activeGroupId)?.activeTabId,
  );
export function patchReaderTab(
  w: Workspace,
  id: string,
  patch: Partial<ReaderTab>,
): Workspace {
  return {
    ...w,
    tabs: w.tabs.map((t) =>
      t.id === id ? { ...t, ...patch, id: t.id, bookId: t.bookId } : t,
    ),
  };
}
export function selectReaderTab(w: Workspace, id: string): Workspace {
  const group = w.groups.find((g) => g.tabs.includes(id));
  return group
    ? {
        ...w,
        home: false,
        activeGroupId: group.id,
        groups: w.groups.map((g) =>
          g.id === group.id ? { ...g, activeTabId: id } : g,
        ),
      }
    : w;
}
export function openReaderTab(
  w: Workspace,
  book: Book,
  tabId: string,
  groupId: string,
): Workspace {
  const existing = w.tabs.find((t) => t.bookId === book.id);
  if (existing) return selectReaderTab(w, existing.id);
  if (w.tabs.length >= 50)
    throw new Error("最多打开 50 个标签，请先关闭部分标签。");
  const group =
    w.groups.find((g) => g.id === groupId) ||
    w.groups.find((g) => g.id === w.activeGroupId) ||
    w.groups[0];
  const nextGroup = group || { id: groupId, tabs: [], activeTabId: tabId };
  const next: Workspace = {
    ...w,
    home: false,
    activeGroupId: nextGroup.id,
    tabs: [
      ...w.tabs,
      {
        id: tabId,
        bookId: book.id,
        position: { ...book.position },
        mode: book.mode,
        history: [],
        query: "",
      },
    ],
    groups: group
      ? w.groups.map((g) =>
          g.id === group.id
            ? { ...g, tabs: [...g.tabs, tabId], activeTabId: tabId }
            : g,
        )
      : [{ ...nextGroup, tabs: [tabId], activeTabId: tabId }],
  };
  if (!w.tabs.length && book.split) {
    return {
      ...splitReaderTab(next, tabId, "horizontal", true, book.secondary),
      activeGroupId: nextGroup.id,
    };
  }
  return next;
}
function normalize(w: Workspace): Workspace {
  const groups = w.groups
    .filter((g) => g.tabs.length)
    .map((g) => ({
      ...g,
      activeTabId: g.tabs.includes(g.activeTabId) ? g.activeTabId : g.tabs[0],
    }));
  return {
    ...w,
    groups,
    activeGroupId: groups.some((g) => g.id === w.activeGroupId)
      ? w.activeGroupId
      : groups[0]?.id || "",
    home: !groups.length || w.home,
  };
}
export function closeReaderTab(w: Workspace, id: string): Workspace {
  if (w.tabs.find((t) => t.id === id)?.draft?.text.trim())
    throw new Error("这个标签还有笔记草稿，请先添加笔记或清空草稿再关闭。");
  return normalize({
    ...w,
    tabs: w.tabs.filter((t) => t.id !== id),
    groups: w.groups.map((g) => {
      const index = g.tabs.indexOf(id),
        tabs = g.tabs.filter((t) => t !== id);
      return {
        ...g,
        tabs,
        activeTabId:
          g.activeTabId === id
            ? tabs[Math.min(index, tabs.length - 1)] || ""
            : g.activeTabId,
      };
    }),
  });
}
export function moveReaderTab(
  w: Workspace,
  id: string,
  groupId: string,
  beforeId?: string,
): Workspace {
  if (
    !w.tabs.some((t) => t.id === id) ||
    !w.groups.some((g) => g.id === groupId) ||
    id === beforeId
  )
    return w;
  const groups = w.groups.map((g) => {
    const tabs = g.tabs.filter((t) => t !== id);
    if (g.id === groupId) {
      const at = beforeId ? tabs.indexOf(beforeId) : -1;
      tabs.splice(at < 0 ? tabs.length : at, 0, id);
    }
    return { ...g, tabs, activeTabId: g.id === groupId ? id : g.activeTabId };
  });
  return normalize({ ...w, groups, activeGroupId: groupId, home: false });
}
export function splitReaderTab(
  w: Workspace,
  id: string,
  orientation: Workspace["orientation"],
  duplicate = false,
  position?: ReadingPosition,
): Workspace {
  const tab = w.tabs.find((t) => t.id === id),
    source = w.groups.find((g) => g.tabs.includes(id));
  if (!tab || !source) return w;
  if (!duplicate && w.groups.length === 2 && source.id === w.groups[1].id)
    return { ...selectReaderTab(w, id), orientation };
  let result = w;
  // A single tab dragged to the edge opens a second view of the same document.
  if (duplicate || (w.groups.length === 1 && source.tabs.length === 1)) {
    if (w.tabs.length >= 50)
      throw new Error("最多打开 50 个标签，请先关闭部分标签。");
    const copy = {
      ...tab,
      id: crypto.randomUUID(),
      position: { ...(position || tab.position) },
      mode: "single" as const,
      history: [],
      draft: undefined,
    };
    result = { ...w, tabs: [...w.tabs, copy] };
    id = copy.id;
  }
  const target = result.groups.find((g) => g.id !== source.id);
  if (!target)
    result = {
      ...result,
      groups: [
        ...result.groups,
        { id: crypto.randomUUID(), tabs: [], activeTabId: "" },
      ],
    };
  result = moveReaderTab(result, id, target?.id || result.groups[1].id);
  return { ...result, orientation, ratio: 0.5, home: false };
}
export function mergeReaderGroups(w: Workspace): Workspace {
  if (w.groups.length < 2) return w;
  const activeId = activeReaderTab(w)?.id || w.groups[0].activeTabId;
  return {
    ...w,
    groups: [
      {
        ...w.groups[0],
        tabs: w.groups.flatMap((g) => g.tabs),
        activeTabId: activeId,
      },
    ],
    activeGroupId: w.groups[0].id,
    ratio: 0.5,
  };
}
export function validateWorkspace(
  value: unknown,
  books: Book[],
): asserts value is Workspace {
  const w = value as Workspace;
  const fail = () => {
    throw new Error("工作区记录无效，原书库未修改。");
  };
  if (
    !w ||
    w.version !== 1 ||
    !Array.isArray(w.tabs) ||
    w.tabs.length > 50 ||
    !Array.isArray(w.groups) ||
    w.groups.length > 2 ||
    !["horizontal", "vertical"].includes(w.orientation) ||
    !Number.isFinite(w.ratio) ||
    w.ratio < 0.2 ||
    w.ratio > 0.8 ||
    typeof w.home !== "boolean"
  )
    return fail();
  const ids = new Set<string>(),
    groupIds = new Set<string>(),
    assigned = new Set<string>();
  const stringId = (s: unknown): s is string =>
    typeof s === "string" && !!s && s.length <= 100;
  const validPosition = (p: ReadingPosition, total: number) =>
    p &&
    Number.isInteger(p.page) &&
    p.page >= 1 &&
    p.page <= total &&
    Number.isFinite(p.offset) &&
    p.offset >= 0 &&
    p.offset <= 1 &&
    Number.isFinite(p.zoom) &&
    (p.zoom === 0 || (p.zoom >= 0.25 && p.zoom <= 3)) &&
    [0, 90, 180, 270].includes(p.rotation);
  for (const t of w.tabs) {
    if (!t || !stringId(t.id) || ids.has(t.id)) return fail();
    const book = books.find((b) => b.id === t.bookId);
    if (
      !book ||
      !validPosition(t.position, book.pages) ||
      !["continuous", "single", "spread"].includes(t.mode) ||
      !Array.isArray(t.history) ||
      t.history.length > 100 ||
      t.history.some((p) => !validPosition(p, book.pages)) ||
      typeof t.query !== "string" ||
      t.query.length > 10000
    )
      return fail();
    if (
      t.draft !== undefined &&
      (!t.draft ||
        typeof t.draft.text !== "string" ||
        t.draft.text.length > 100000 ||
        !Number.isInteger(t.draft.page) ||
        t.draft.page < 1 ||
        t.draft.page > book.pages)
    )
      return fail();
    ids.add(t.id);
  }
  for (const g of w.groups) {
    if (
      !g ||
      !stringId(g.id) ||
      groupIds.has(g.id) ||
      !Array.isArray(g.tabs) ||
      !g.tabs.length ||
      !g.tabs.includes(g.activeTabId)
    )
      return fail();
    for (const id of g.tabs) {
      if (!ids.has(id) || assigned.has(id)) return fail();
      assigned.add(id);
    }
    groupIds.add(g.id);
  }
  if (
    assigned.size !== ids.size ||
    (w.groups.length
      ? !groupIds.has(w.activeGroupId)
      : w.activeGroupId !== "" || !w.home)
  )
    return fail();
}
