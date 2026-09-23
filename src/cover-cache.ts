import type { Book } from "./model";
export function coverKey(book: Book): string {
  return JSON.stringify([
    "cover-v1",
    book.documentSignature || [book.id, book.path || book.source],
    book.pages,
    book.coverPage || 1,
  ]);
}
type Record = { key: string; bytes: ArrayBuffer; touched: number };
const MAX_BYTES = 32 * 1024 * 1024,
  MAX_ITEMS = 100;
async function open() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("rhine-cover-cache", 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore("covers", { keyPath: "key" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function cachedCover(key: string): Promise<Blob | undefined> {
  const db = await open();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction("covers", "readwrite"),
        store = tx.objectStore("covers");
      let blob: Blob | undefined;
      const request = store.get(key);
      request.onsuccess = () => {
        const value = request.result as Record | undefined;
        if (
          value?.bytes instanceof ArrayBuffer &&
          value.bytes.byteLength <= 2 * 1024 * 1024 &&
          [137, 80, 78, 71, 13, 10, 26, 10].every(
            (byte, index) => new Uint8Array(value.bytes)[index] === byte,
          )
        ) {
          blob = new Blob([value.bytes], { type: "image/png" });
          store.put({ ...value, touched: Date.now() });
        } else if (value) store.delete(key);
      };
      tx.oncomplete = () => resolve(blob);
      tx.onabort = () => reject(tx.error);
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
export async function cacheCover(key: string, blob: Blob) {
  if (blob.size > 2 * 1024 * 1024) return;
  const bytes = await blob.arrayBuffer(),
    db = await open();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("covers", "readwrite"),
        store = tx.objectStore("covers");
      store.put({ key, bytes, touched: Date.now() } satisfies Record);
      const request = store.getAll();
      request.onsuccess = () => {
        const entries = (request.result as Record[]).sort((a, b) =>
          a.key === key ? -1 : b.key === key ? 1 : b.touched - a.touched,
        );
        let size = 0;
        entries.forEach((entry, index) => {
          size += entry.bytes.byteLength;
          if (index >= MAX_ITEMS || size > MAX_BYTES) store.delete(entry.key);
        });
      };
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error);
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export async function forgetCover(key: string) {
  const db = await open();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("covers", "readwrite");
      tx.objectStore("covers").delete(key);
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error);
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
