import { beforeEach, afterEach, expect, test, vi } from "vitest";
import {
  browserBackups,
  browserReadBackup,
  browserSnapshot,
} from "./backup-store";
import { emptyLibrary } from "./model";
import {
  loadLibrary,
  readStoredLibrary,
  restoreLibrary,
  saveLibrary,
} from "./storage";

vi.mock("@tauri-apps/api/core", () => ({
  isTauri: () => false,
  invoke: vi.fn(),
}));
beforeEach(() => {
  const values = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

test("unreadable and empty stored content is never treated as a new shelf", async () => {
  localStorage.setItem("pagewise-library", "damaged original");
  await expect(loadLibrary()).rejects.toThrow();
  expect(await readStoredLibrary()).toBe("damaged original");
  localStorage.setItem("pagewise-library", "");
  await expect(loadLibrary()).rejects.toThrow();
});

test("automatic snapshots rotate while manual/protection data remains intact", () => {
  browserSnapshot("original invalid data", "before-restore", 1);
  browserSnapshot("manual data", "manual", 2);
  for (let index = 1; index <= 35; index++) {
    browserSnapshot(
      JSON.stringify({ books: [{ id: index }] }),
      "auto",
      index * 31 * 60 * 1000,
    );
  }
  const entries = browserBackups();
  expect(entries.filter((entry) => entry.reason === "auto")).toHaveLength(30);
  expect(
    browserReadBackup(
      entries.find((entry) => entry.reason === "before-restore")!.id,
    ),
  ).toBe("original invalid data");
  expect(entries.some((entry) => entry.reason === "manual")).toBe(true);
  const latest = entries[0];
  browserSnapshot(browserReadBackup(latest.id), "auto", 999999999);
  expect(browserBackups()).toHaveLength(32);
});

test("restore protects damaged raw data and a failed protection write prevents replacement", async () => {
  const original = "{broken original library";
  localStorage.setItem("pagewise-library", original);
  const write = vi.spyOn(localStorage, "setItem").mockImplementationOnce(() => {
    throw new DOMException("Full", "QuotaExceededError");
  });
  await expect(restoreLibrary(emptyLibrary())).rejects.toThrow();
  expect(await readStoredLibrary()).toBe(original);
  write.mockRestore();
  await restoreLibrary(emptyLibrary());
  expect(await loadLibrary()).toEqual(emptyLibrary());
  const entry = browserBackups().find(
    (entry) => entry.reason === "before-restore",
  )!;
  expect(browserReadBackup(entry.id)).toBe(original);
});

test("failed save is retryable and queued recovery cannot be overtaken by an older save", async () => {
  const old = emptyLibrary(),
    next = { ...old, dark: true };
  const failure = vi
    .spyOn(localStorage, "setItem")
    .mockImplementationOnce(() => {
      throw new Error("disk full");
    });
  await expect(saveLibrary(old)).rejects.toThrow();
  failure.mockRestore();
  const save = saveLibrary(old);
  const restore = restoreLibrary(next);
  await Promise.all([save, restore]);
  expect(await loadLibrary()).toEqual(next);
  expect(JSON.parse(browserReadBackup(browserBackups()[0].id))).toEqual(old);
});
