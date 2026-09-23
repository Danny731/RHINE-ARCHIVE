import { afterEach, expect, test, vi } from "vitest";
import type { PDFDocumentProxy } from "pdfjs-dist";
import {
  cachePageSizes,
  ensurePageSize,
  pageSizeOf,
  subscribePageSizes,
} from "./page-geometry";
import {
  canvasScale,
  MAX_PAGE_PIXELS,
  RenderScheduler,
} from "./render-scheduler";
afterEach(() => vi.useRealTimers());

test("first-page readiness does not wait for a 500-page geometry scan and prioritizes saved pages", async () => {
  vi.useFakeTimers();
  const getPage = vi.fn(async (n: number) => ({
    getViewport: () => ({ width: n === 450 ? 900 : 600, height: 800 }),
  }));
  const pdf = {
    numPages: 500,
    getPage,
    loadingTask: { destroyed: false },
  } as unknown as PDFDocumentProxy;
  const first = cachePageSizes(pdf, [450]);
  expect(cachePageSizes(pdf)).toBe(first);
  await first;
  expect(getPage.mock.calls.map(([n]) => n)).toEqual([1, 2, 450]);
  expect(pageSizeOf(pdf, 450).width).toBe(900);
  const changed = vi.fn();
  const stop = subscribePageSizes(pdf, changed);
  await Promise.all([ensurePageSize(pdf, 300), ensurePageSize(pdf, 300)]);
  expect(getPage.mock.calls.filter(([n]) => n === 300)).toHaveLength(1);
  pdf.loadingTask.destroyed = true;
  await vi.runAllTimersAsync();
  expect(getPage).toHaveBeenCalledTimes(4);
  stop();
});

test("mixed page sizes become exact in background and notify layout subscribers", async () => {
  vi.useFakeTimers();
  const pdf = {
    numPages: 20,
    getPage: async (n: number) => ({
      getViewport: () => ({ width: 600, height: n % 2 ? 800 : 400 }),
    }),
    loadingTask: { destroyed: false },
  } as unknown as PDFDocumentProxy;
  await cachePageSizes(pdf);
  const listener = vi.fn();
  const stop = subscribePageSizes(pdf, listener);
  expect(pageSizeOf(pdf, 20).height).toBe(800);
  await vi.runAllTimersAsync();
  expect(pageSizeOf(pdf, 20).height).toBe(400);
  expect(listener).toHaveBeenCalled();
  stop();
});

test("render queue bounds concurrency, prioritizes reading over thumbnails and discards stale work", async () => {
  const scheduler = new RenderScheduler(2);
  const starts: string[] = [];
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const live = new AbortController(),
    cancelled = new AbortController();
  const first = scheduler.run(async () => {
    starts.push("first");
    await gate;
  }, live.signal);
  const second = scheduler.run(async () => {
    starts.push("second");
    await gate;
  }, live.signal);
  const thumb = scheduler.run(
    async () => {
      starts.push("thumb");
    },
    live.signal,
    2,
  );
  const stale = scheduler
    .run(
      async () => {
        starts.push("stale");
      },
      cancelled.signal,
      0,
    )
    .catch((error: Error) => error.name);
  const reader = scheduler.run(
    async () => {
      starts.push("reader");
    },
    live.signal,
    0,
  );
  expect(scheduler.stats).toEqual({ active: 2, queued: 3, limit: 2 });
  cancelled.abort();
  expect(await stale).toBe("AbortError");
  release();
  await Promise.all([first, second, thumb, reader]);
  expect(starts).toEqual(["first", "second", "reader", "thumb"]);
});

test("high DPI and extreme page dimensions respect pixel and texture limits", () => {
  for (const [width, height] of [
    [3000, 4000],
    [10000, 12000],
    [50000, 100],
    [500, 700],
  ]) {
    const ratio = canvasScale(width, height, 3);
    expect(
      Math.floor(width * ratio) * Math.floor(height * ratio),
    ).toBeLessThanOrEqual(MAX_PAGE_PIXELS);
    expect(Math.max(width, height) * ratio).toBeLessThanOrEqual(8192);
  }
});
