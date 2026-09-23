import { test, expect, type Page } from "@playwright/test";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { readFile } from "node:fs/promises";

test("cover cache evicts only its images, bounds storage and rejects broken records", async ({
  page,
}) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const { cacheCover, cachedCover } = await import("/src/cover-cache.ts");
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 2;
    const png = await new Promise<Blob>((resolve) =>
      canvas.toBlob((blob) => resolve(blob!), "image/png"),
    );
    for (let i = 0; i < 102; i++) await cacheCover(`item-${i}`, png);
    const count = await new Promise<number>((resolve, reject) => {
      const req = indexedDB.open("rhine-cover-cache", 1);
      req.onsuccess = () => {
        const db = req.result,
          tx = db.transaction("covers");
        const count = tx.objectStore("covers").count();
        count.onsuccess = () => resolve(count.result);
        tx.oncomplete = () => db.close();
      };
      req.onerror = () => reject(req.error);
    });
    await cacheCover("broken", new Blob(["not png"]));
    const broken = await cachedCover("broken");
    const large = new Blob(
      [await png.arrayBuffer(), new Uint8Array(1_900_000)],
      { type: "image/png" },
    );
    for (let i = 0; i < 20; i++) await cacheCover(`large-${i}`, large);
    const total = await new Promise<number>((resolve, reject) => {
      const req = indexedDB.open("rhine-cover-cache", 1);
      req.onsuccess = () => {
        const db = req.result,
          tx = db.transaction("covers"),
          all = tx.objectStore("covers").getAll();
        all.onsuccess = () =>
          resolve(
            all.result.reduce((sum, entry) => sum + entry.bytes.byteLength, 0),
          );
        tx.oncomplete = () => db.close();
      };
      req.onerror = () => reject(req.error);
    });
    return {
      count,
      broken: !!broken,
      total,
      latest: !!(await cachedCover("large-19")),
    };
  });
  expect(result.count).toBe(100);
  expect(result.broken).toBe(false);
  expect(result.total).toBeLessThanOrEqual(32 * 1024 * 1024);
  expect(result.latest).toBe(true);
});

async function makePdf() {
  const pdf = await PDFDocument.create(),
    font = await pdf.embedFont(StandardFonts.Helvetica);
  for (const [n, color] of [
    [1, rgb(0.2, 0.4, 0.6)],
    [2, rgb(0.7, 0.3, 0.2)],
    [3, rgb(0.2, 0.5, 0.3)],
  ] as const) {
    const page = pdf.addPage(n === 2 ? [600, 300] : [300, 450]);
    page.drawRectangle({
      x: 0,
      y: 0,
      width: page.getWidth(),
      height: page.getHeight(),
      color,
    });
    page.drawText(`Cover page ${n}`, {
      x: 30,
      y: page.getHeight() - 70,
      size: 22,
      font,
      color: rgb(1, 1, 1),
    });
  }
  return Buffer.from(await pdf.save());
}
async function menu(page: Page, name: string) {
  await page.getByRole("button", { name: "应用菜单", exact: true }).click();
  await page.getByRole("menuitem", { name, exact: true }).click();
}
const stored = (page: Page) =>
  page.evaluate(
    () =>
      JSON.parse(localStorage.getItem("pagewise-library") || "{}").books?.[0],
  );
async function coverPixels(page: Page) {
  return page
    .locator(".cover-image")
    .evaluate(async (img: HTMLImageElement) => {
      await img.decode();
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext("2d")!.drawImage(img, 0, 0);
      return {
        width: img.naturalWidth,
        height: img.naturalHeight,
        pixel: [...canvas.getContext("2d")!.getImageData(2, 2, 1, 1).data],
      };
    });
}

test("real PDF covers persist custom pages, retain original colors, reuse cache and reset without changing reading data", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const bytes = await makePdf();
  await page.goto("/");
  await page
    .getByLabel("选择 PDF 文件")
    .setInputFiles({
      name: "cover-demo.pdf",
      mimeType: "application/pdf",
      buffer: bytes,
    });
  await expect(page.locator('[data-page="1"] .textLayer')).toContainText(
    "Cover page 1",
  );
  await page.getByRole("button", { name: "切换书签", exact: true }).click();
  await page.getByTitle("返回书架", { exact: true }).click();
  await expect(page.getByRole("img", { name: "cover-demo封面" })).toBeVisible();
  const first = await coverPixels(page);
  expect(first.height).toBeGreaterThan(first.width);
  await page.locator(".book-card").click();
  const input = page.getByRole("textbox", { name: "页码", exact: true });
  await input.fill("2");
  await input.press("Enter");
  await expect(page.locator('[data-page="2"] .textLayer')).toContainText(
    "Cover page 2",
  );
  await menu(page, "将当前页设为封面");
  await expect.poll(async () => (await stored(page))?.coverPage).toBe(2);
  await expect(input).toHaveValue("2");
  await menu(page, "切换深色界面");
  await page.getByTitle("返回书架", { exact: true }).click();
  await expect(page.getByRole("img", { name: "cover-demo封面" })).toBeVisible();
  await expect(page.getByText("封面 · 第 2 页", { exact: true })).toBeVisible();
  const selected = await coverPixels(page);
  expect(selected.width).toBeGreaterThan(selected.height);
  expect(selected.pixel).not.toEqual(first.pixel);
  await expect(page.locator(".cover-image")).toHaveCSS("object-fit", "contain");
  const sourceBytes = await page.evaluate(async () => {
    const { cachedFile } = await import("/src/storage.ts");
    const library = JSON.parse(localStorage.getItem("pagewise-library")!);
    return [
      ...new Uint8Array(
        await (await cachedFile(library.books[0].id))!.arrayBuffer(),
      ),
    ];
  });
  expect(Buffer.from(sourceBytes)).toEqual(bytes);
  expect((await stored(page)).bookmarks).toHaveLength(1);
  await page.getByRole("button", { name: "列表", exact: true }).click();
  expect(await coverPixels(page)).toEqual(selected);
  await page.reload();
  await expect(page.locator(".cover-image")).toBeVisible();
  expect(await coverPixels(page)).toEqual(selected);
  await expect.poll(() => page.workers().length).toBe(0); // Shelf cache needs no PDF worker.
  await page.getByTitle("设置与备份", { exact: true }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出备份", exact: true }).click();
  const backup = JSON.parse(
    await readFile((await (await download).path())!, "utf8"),
  );
  expect(backup.books[0].coverPage).toBe(2);
  expect(JSON.stringify(backup)).not.toContain("data:image");
  await page.getByTitle("关闭设置").click();
  await page.locator(".book-card").click();
  await expect(input).toHaveValue("2");
  await menu(page, "恢复默认封面");
  await expect.poll(async () => (await stored(page))?.coverPage).toBe(1);
  await page.getByTitle("返回书架", { exact: true }).click();
  await expect(page.locator(".cover-image")).toBeVisible();
  expect(await coverPixels(page)).toEqual(first);
  expect((await stored(page)).position.page).toBe(2);
  expect(errors).toEqual([]);
});

test("old books generate visible covers on demand and missing PDFs fall back without breaking the shelf", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "体验示例教材" }).click();
  await expect(page.locator('[data-page="1"] .textLayer')).toContainText(
    "Linear algebra begins",
  );
  await page.getByTitle("返回书架", { exact: true }).click();
  await expect(page.locator(".cover-image")).toBeVisible();
  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase("rhine-cover-cache");
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  });
  await page.reload();
  await expect(page.locator(".cover-image")).toBeVisible();
  await expect.poll(() => page.workers().length).toBe(0);
  await page.evaluate(() => {
    const lib = JSON.parse(localStorage.getItem("pagewise-library")!);
    const missing = {
      ...lib.books[0],
      id: "missing-cover",
      source: "file",
      title: "Missing PDF",
      documentSignature: undefined,
      path: "Z:/unavailable.pdf",
    };
    localStorage.setItem(
      "missing-cover-fixture",
      JSON.stringify({ version: 1, books: [missing], dark: false }),
    );
  });
  await page.addInitScript(() => {
    const fixture = localStorage.getItem("missing-cover-fixture");
    if (fixture) localStorage.setItem("pagewise-library", fixture);
  });
  await page.reload();
  await expect(page.getByLabel("暂无封面，打开 PDF 后可重试")).toBeVisible();
  await expect(page.locator(".book-card h3")).toHaveText("Missing PDF");
  await expect(page.getByLabel("操作错误")).toHaveCount(0);
});
