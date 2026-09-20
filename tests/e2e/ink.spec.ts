import { test, expect, type Page, type Locator } from "@playwright/test";
import { resolve } from "node:path";
import { PDFDocument, degrees, PDFName, PDFNumber } from "pdf-lib";

const firstInk = (page: Page) =>
  page.locator('.workspace-group.is-active [data-page="1"] .ink-layer');
const savedLibrary = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem("pagewise-library")!));
async function setup(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "体验示例教材" }).click();
  await expect(firstInk(page)).toBeVisible();
  await expect(page.getByText("阅读资料已保存")).toBeVisible();
  await page.getByRole("button", { name: "绘制", exact: true }).click();
  await expect(firstInk(page)).toHaveClass(/editable/);
}
async function draw(page: Page, layer = firstInk(page), offset = 0) {
  const rect = await layer.boundingBox();
  if (!rect) throw new Error("Missing handwriting layer");
  await page.mouse.move(rect.x + 55, rect.y + 55 + offset);
  await page.mouse.down();
  await page.mouse.move(rect.x + 125, rect.y + 80 + offset, { steps: 12 });
  await page.mouse.up();
}
async function count(layer: Locator, n: number) {
  await expect(layer.locator("[data-ink-id]")).toHaveCount(n);
}

test("pen style, ink undo/redo, eraser, rotation/zoom and reload preserve original PDF coordinates", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await setup(page);
  await page.getByLabel("画笔颜色").fill("#2030ec");
  await page.getByLabel("画笔粗细").selectOption("4");
  await draw(page);
  await count(firstInk(page), 1);
  await expect(firstInk(page).locator("polyline")).toHaveAttribute(
    "stroke",
    "#2030ec",
  );
  await expect(page.getByText("阅读资料已保存")).toBeVisible();
  const book = (await savedLibrary(page)).books[0];
  expect(book.inkStrokes[0]).toMatchObject({
    width: 4,
    color: "#2030ec",
    page: 1,
  });
  const backup = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("pagewise-library-before-ink-v1")!),
  );
  expect(backup.books[0].inkStrokes).toBeUndefined();
  expect(backup.books[0].id).toBe(book.id);
  await page.keyboard.press("Control+z");
  await count(firstInk(page), 0);
  await page.keyboard.press("Control+Shift+z");
  await count(firstInk(page), 1);
  await page.getByRole("button", { name: "橡皮擦", exact: true }).click();
  await draw(page);
  await count(firstInk(page), 0);
  await page.getByRole("button", { name: "撤销手写", exact: true }).click();
  await count(firstInk(page), 1);
  const before = await firstInk(page)
    .locator("polyline")
    .getAttribute("points");
  await page.getByTitle("旋转页面", { exact: true }).click();
  await expect(firstInk(page).locator("polyline")).not.toHaveAttribute(
    "points",
    before!,
  );
  await page.getByRole("button", { name: "放大", exact: true }).click();
  await expect(firstInk(page)).toBeVisible();
  await expect(page.getByText("阅读资料已保存")).toBeVisible();
  expect((await savedLibrary(page)).books[0].inkStrokes).toEqual(
    book.inkStrokes,
  );
  await page.reload();
  await count(firstInk(page), 1);
  expect((await savedLibrary(page)).books[0].inkStrokes).toEqual(
    book.inkStrokes,
  );
  expect(errors).toEqual([]);
});

test("same-document split shares handwriting; separate PDFs keep their own undo history", async ({
  page,
}) => {
  await setup(page);
  await draw(page);
  await page.getByRole("button", { name: "分屏对照", exact: true }).click();
  await page.getByRole("textbox", { name: "对照页码" }).fill("1");
  await page.getByRole("textbox", { name: "对照页码" }).press("Enter");
  const left = page
    .locator(".workspace-group")
    .first()
    .locator('[data-page="1"] .ink-layer');
  const right = page
    .locator(".workspace-group")
    .last()
    .locator('[data-page="1"] .ink-layer');
  await count(left, 1);
  await count(right, 1);
  await draw(page, right, 45);
  await count(left, 2);
  await count(right, 2);
  await page.getByRole("button", { name: "撤销手写", exact: true }).click();
  await count(left, 1);
  await count(right, 1);
  await page
    .getByLabel("选择 PDF 文件")
    .setInputFiles(resolve("tests/fixtures/toc-headings.pdf"));
  await expect(page.locator(".document-title strong")).toHaveText(
    "toc-headings",
  );
  await expect(firstInk(page)).toBeVisible();
  await page.getByRole("button", { name: "绘制", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "撤销手写", exact: true }),
  ).toBeDisabled();
  await draw(page);
  await count(firstInk(page), 1);
  await count(left, 1);
  await page.keyboard.press("Control+z");
  await count(firstInk(page), 0);
  await count(left, 1);
  await expect(page.getByText("阅读资料已保存")).toBeVisible();
  const books = (await savedLibrary(page)).books;
  expect(
    books.find((b: any) => b.title === "toc-headings").inkStrokes,
  ).toHaveLength(0);
  expect(
    books.find((b: any) => b.title !== "toc-headings").inkStrokes,
  ).toHaveLength(1);
});

test("cancelled strokes and finger touches do not save; dot strokes export as visible PDF content", async ({
  page,
}) => {
  await setup(page);
  const layer = firstInk(page);
  const rect = (await layer.boundingBox())!;
  await layer.dispatchEvent("pointerdown", {
    pointerId: 10,
    pointerType: "touch",
    button: 0,
    clientX: rect.x + 55,
    clientY: rect.y + 55,
  });
  await layer.dispatchEvent("pointerup", {
    pointerId: 10,
    pointerType: "touch",
    button: 0,
  });
  await count(layer, 0);
  await page.mouse.move(rect.x + 55, rect.y + 55);
  await page.mouse.down();
  await page.mouse.move(rect.x + 80, rect.y + 80);
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await count(layer, 0);
  await page.getByRole("button", { name: "绘制", exact: true }).click();
  await page.getByLabel("画笔颜色").fill("#2030ec");
  await page.getByLabel("画笔粗细").selectOption("8");
  const dotRect = (await layer.boundingBox())!;
  await page.mouse.click(dotRect.x + 55, dotRect.y + 55);
  await count(layer, 1);
  await draw(page, layer, 40);
  await count(layer, 2);
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出手写 PDF", exact: true }).click();
  const download = await downloadPromise;
  const path = await download.path();
  expect(path).toBeTruthy();
  await page.getByLabel("选择 PDF 文件").setInputFiles({
    name: "手写副本.pdf",
    mimeType: "application/pdf",
    buffer: await (await import("node:fs/promises")).readFile(path!),
  });
  await expect(page.locator(".document-title strong")).toHaveText("手写副本");
  await expect(firstInk(page)).toBeVisible();
  await count(firstInk(page), 0); // Flattened content is visible even without app-side ink data.
  const bluePixels = await page
    .locator('.workspace-group.is-active [data-page="1"] canvas')
    .evaluate((node: HTMLCanvasElement) => {
      const { data } = node
        .getContext("2d")!
        .getImageData(0, 0, node.width, node.height);
      let count = 0;
      for (let i = 0; i < data.length; i += 4)
        if (data[i] < 50 && data[i + 1] < 70 && data[i + 2] > 220) count++;
      return count;
    });
  expect(bluePixels).toBeGreaterThan(100);
  await expect(
    page.locator('.workspace-group.is-active [data-page="1"] .textLayer'),
  ).toContainText("Linear algebra begins");
});

test("900px toolbar stays within the window and note editing retains normal text undo", async ({
  page,
}) => {
  await page.setViewportSize({ width: 900, height: 650 });
  await setup(page);
  const exportButton = await page
    .getByRole("button", { name: "导出手写 PDF", exact: true })
    .boundingBox();
  expect(exportButton!.x + exportButton!.width).toBeLessThanOrEqual(900);
  await draw(page);
  await page.getByTitle("切换笔记面板").click();
  const note = page.getByRole("textbox", { name: "新笔记" });
  await note.fill("draft");
  await note.press("Control+z");
  await count(firstInk(page), 1);
});

test("cropped, intrinsically rotated pages with UserUnit export handwriting at the same visible position", async ({
  page,
}) => {
  const pdf = await PDFDocument.create();
  const sheet = pdf.addPage([500, 700]);
  sheet.setCropBox(30, 45, 300, 450);
  sheet.setRotation(degrees(90));
  sheet.node.set(PDFName.of("UserUnit"), PDFNumber.of(1.5));
  await page.goto("/");
  await page
    .getByLabel("选择 PDF 文件")
    .setInputFiles({
      name: "rotated.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from(await pdf.save()),
    });
  await expect(firstInk(page)).toBeVisible();
  await page.getByRole("button", { name: "绘制", exact: true }).click();
  await page.getByLabel("画笔颜色").fill("#2030ec");
  await page.getByLabel("画笔粗细").selectOption("4");
  await draw(page);
  await count(firstInk(page), 1);
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出手写 PDF", exact: true }).click();
  const path = await (await downloadPromise).path();
  await page
    .getByLabel("选择 PDF 文件")
    .setInputFiles({
      name: "rotated-copy.pdf",
      mimeType: "application/pdf",
      buffer: await (await import("node:fs/promises")).readFile(path!),
    });
  await expect(page.locator(".document-title strong")).toHaveText(
    "rotated-copy",
  );
  await expect(firstInk(page)).toBeVisible();
  const bounds = await page
    .locator('.workspace-group.is-active [data-page="1"] canvas')
    .evaluate((node: HTMLCanvasElement) => {
      const pixels = node
        .getContext("2d")!
        .getImageData(0, 0, node.width, node.height).data;
      const rect = node.getBoundingClientRect();
      let minX = Infinity,
        minY = Infinity,
        maxX = -1,
        maxY = -1;
      for (let y = 0; y < node.height; y++)
        for (let x = 0; x < node.width; x++) {
          const i = (y * node.width + x) * 4;
          if (pixels[i] < 50 && pixels[i + 1] < 70 && pixels[i + 2] > 220) {
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);
          }
        }
      return {
        x: (((minX + maxX) / 2) * rect.width) / node.width,
        y: (((minY + maxY) / 2) * rect.height) / node.height,
      };
    });
  expect(Math.abs(bounds.x - 90)).toBeLessThan(2);
  expect(Math.abs(bounds.y - 67.5)).toBeLessThan(2);
});
