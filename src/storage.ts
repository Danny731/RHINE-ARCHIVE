import { invoke, isTauri } from "@tauri-apps/api/core";
import { emptyLibrary, validateLibrary, type Library } from "./model";
export const desktop = isTauri();
export async function loadLibrary(): Promise<Library> {
  const raw = desktop
    ? await invoke<string | null>("load_library")
    : localStorage.getItem("pagewise-library");
  return raw ? validateLibrary(JSON.parse(raw)) : emptyLibrary();
}
let saveQueue: Promise<unknown> = Promise.resolve();
export function saveLibrary(lib: Library): Promise<void> {
  const json = JSON.stringify(lib);
  const operation = () => {
    if (desktop) return invoke<void>("save_library", { json });
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
    return Promise.resolve(localStorage.setItem("pagewise-library", json));
  };
  const result = saveQueue.then(operation, operation);
  saveQueue = result;
  return result;
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
  const db = await fileDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("files", "readwrite");
    tx.objectStore("files").put(file, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  }).finally(() => db.close());
}
export async function cachedFile(id: string): Promise<Blob | undefined> {
  const db = await fileDb();
  return new Promise<Blob | undefined>((resolve, reject) => {
    const req = db.transaction("files").objectStore("files").get(id);
    req.onsuccess = () => resolve(req.result);
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
