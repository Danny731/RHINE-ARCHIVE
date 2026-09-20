import type { Library } from "./model";

export function nameCollection(
  library: Library,
  id: string,
  value: string,
): Library {
  const name = value.trim();
  if (!name || name.length > 60) throw new Error("合集名称需要 1–60 个字符。");
  const collections = library.collections || [];
  if (
    collections.some(
      (c) =>
        c.id !== id &&
        c.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase(),
    )
  )
    throw new Error("已有同名合集，请换一个名称。");
  const existing = collections.find((c) => c.id === id);
  if (!existing && collections.length >= 1000)
    throw new Error("合集数量已达上限。");
  return {
    ...library,
    collections: existing
      ? collections.map((c) => (c.id === id ? { ...c, name } : c))
      : [...collections, { id, name, bookIds: [] }],
  };
}
export function deleteCollection(library: Library, id: string): Library {
  return {
    ...library,
    collections: (library.collections || []).filter((c) => c.id !== id),
  };
}
export function assignBook(
  library: Library,
  bookId: string,
  collectionIds: string[],
): Library {
  if (!library.books.some((b) => b.id === bookId)) return library;
  return {
    ...library,
    collections: (library.collections || []).map((c) => ({
      ...c,
      bookIds: collectionIds.includes(c.id)
        ? [...new Set([...c.bookIds, bookId])]
        : c.bookIds.filter((id) => id !== bookId),
    })),
  };
}
export function addToCollection(
  library: Library,
  collectionId: string | undefined,
  bookId: string,
): Library {
  if (!collectionId || !library.books.some((b) => b.id === bookId))
    return library;
  return {
    ...library,
    collections: (library.collections || []).map((c) =>
      c.id === collectionId
        ? { ...c, bookIds: [...new Set([...c.bookIds, bookId])] }
        : c,
    ),
  };
}
export function setCollectionBooks(
  library: Library,
  collectionId: string,
  bookIds: string[],
): Library {
  const activeIds = new Set(
    library.books.filter((b) => b.removedAt === undefined).map((b) => b.id),
  );
  return {
    ...library,
    collections: (library.collections || []).map((c) =>
      c.id === collectionId
        ? {
            ...c,
            bookIds: [
              ...new Set([
                ...c.bookIds.filter((id) => !activeIds.has(id)),
                ...bookIds.filter((id) => activeIds.has(id)),
              ]),
            ],
          }
        : c,
    ),
  };
}
export function removeFromShelf(
  library: Library,
  bookId: string,
  now = Date.now(),
): Library {
  return {
    ...library,
    books: library.books.map((b) =>
      b.id === bookId ? { ...b, removedAt: now } : b,
    ),
  };
}
export function restoreToShelf(library: Library, bookId: string): Library {
  return {
    ...library,
    books: library.books.map((b) =>
      b.id === bookId ? { ...b, removedAt: undefined } : b,
    ),
  };
}
