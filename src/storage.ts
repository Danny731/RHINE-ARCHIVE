import { invoke, isTauri } from "@tauri-apps/api/core";
import { emptyLibrary, validateLibrary, type Library } from "./model";
import {
  browserBackups,
  browserReadBackup,
  browserSnapshot,
  type BackupEntry,
} from "./backup-store";
export const desktop = isTauri();
export async function loadLibrary(): Promise<Library> {
  const raw = desktop
    ? await invoke<string | null>("load_library")
    : localStorage.getItem("pagewise-library");
  return raw !== null ? validateLibrary(JSON.parse(raw)) : emptyLibrary();
}
let saveQueue: Promise<unknown> = Promise.resolve();
function queued<T>(operation: () => T | Promise<T>): Promise<T> {
  const result = saveQueue.then(operation, operation);
  saveQueue = result;
  return result;
}
export async function readStoredLibrary(): Promise<string | null> {
  return desktop
    ? invoke<string | null>("read_library_raw")
    : localStorage.getItem("pagewise-library");
}
export async function listBackups(): Promise<BackupEntry[]> {
  return desktop
    ? invoke<BackupEntry[]>("list_library_backups")
    : browserBackups();
}
export async function readBackup(id: string): Promise<string> {
  return desktop
    ? invoke<string>("read_library_backup", { id })
    : browserReadBackup(id);
}
export function createBackup(): Promise<void> {
  return queued(async () => {
    if (desktop) return invoke<void>("create_library_backup");
    const raw = await readStoredLibrary();
    if (raw === null) throw new Error("暂无已保存的书库可备份。");
    browserSnapshot(raw, "manual");
  });
}
export function restoreLibrary(lib: Library): Promise<void> {
  const json = JSON.stringify(validateLibrary(lib));
  return queued(async () => {
    if (desktop) return invoke<void>("restore_library", { json });
    const previous = await readStoredLibrary();
    if (previous !== null) browserSnapshot(previous, "before-restore");
    localStorage.setItem("pagewise-library", json);
  });
}
export function saveLibrary(lib: Library): Promise<void> {
  const json = JSON.stringify(lib);
  const operation = () => {
    if (desktop) return invoke<void>("save_library", { json });
    const coverBackupKey = "pagewise-library-before-cover-v1";
    if (
      lib.books.some((book) => book.coverPage !== undefined) &&
      localStorage.getItem(coverBackupKey) === null
    ) {
      const previous = localStorage.getItem("pagewise-library");
      if (previous !== null) localStorage.setItem(coverBackupKey, previous);
    }
    const inkKey = "pagewise-library-before-ink-v1";
    if (
      lib.books.some((b) => b.inkStrokes !== undefined) &&
      localStorage.getItem(inkKey) === null
    ) {
      const previous = localStorage.getItem("pagewise-library");
      if (previous !== null) localStorage.setItem(inkKey, previous);
    }
    const usesShelf =
      lib.collections !== undefined ||
      lib.books.some((b) => b.removedAt !== undefined);
    const backupKey = "pagewise-library-before-shelf-v1";
    if (usesShelf && localStorage.getItem(backupKey) === null) {
      const previous = localStorage.getItem("pagewise-library");
      if (previous !== null) localStorage.setItem(backupKey, previous);
    }
    const workspaceKey = "pagewise-library-before-workspace-v1";
    if (
      lib.workspace !== undefined &&
      localStorage.getItem(workspaceKey) === null
    ) {
      const previous = localStorage.getItem("pagewise-library");
      if (previous !== null) localStorage.setItem(workspaceKey, previous);
    }
    browserSnapshot(json, "auto");
    return Promise.resolve(localStorage.setItem("pagewise-library", json));
  };
  return queued(operation);
}
export async function pickPdf(): Promise<string | null> {
  return invoke("pick_pdf");
}
export async function exportPdf(
  bytes: Uint8Array,
  name: string,
): Promise<boolean> {
  if (desktop) return invoke<boolean>("export_pdf", bytes);
  const url = URL.createObjectURL(
    new Blob([new Uint8Array(bytes)], { type: "application/pdf" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}
export async function readPdf(path: string): Promise<Uint8Array> {
  return new Uint8Array(await invoke<ArrayBuffer>("read_pdf", { path }));
}
async function fileDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("pagewise-files", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("files");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
export async function cacheFile(id: string, file: Blob): Promise<void> {
  // WebKit's Blob persistence is not available in every port. ArrayBuffers
  // preserve the exact PDF bytes, while cachedFile still accepts legacy blobs.
  const contents = await file.arrayBuffer();
  const db = await fileDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("files", "readwrite");
    const write = tx.objectStore("files").put(contents, id);
    tx.oncomplete = () => resolve();
    write.onerror = () => reject(write.error || new Error("PDF 缓存写入失败"));
    tx.onabort = () => reject(tx.error || new Error("PDF 缓存事务取消"));
  }).finally(() => db.close());
}
export async function cachedFile(id: string): Promise<Blob | undefined> {
  const db = await fileDb();
  return new Promise<Blob | undefined>((resolve, reject) => {
    const req = db.transaction("files").objectStore("files").get(id);
    req.onsuccess = () => {
      const result = req.result;
      resolve(
        result instanceof ArrayBuffer
          ? new Blob([result], { type: "application/pdf" })
          : result,
      );
    };
    req.onerror = () => reject(req.error);
  }).finally(() => db.close());
}
export async function exportText(
  content: string,
  name: string,
): Promise<boolean> {
  if (desktop) return invoke<boolean>("export_text", { content, name });
  const url = URL.createObjectURL(
    new Blob([content], { type: "text/plain;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}
