import { test, expect } from "@playwright/test";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { resolve } from "node:path";

test("live repeated opens and same-document split reuse a single worker, with bounded canvases", async ({
  page,
}) => {
  let workers = 0;
  page.on("worker", () => workers++);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  const open = () =>
    page
      .getByLabel("选择 PDF 文件")
      .setInputFiles(resolve("tests/fixtures/large.pdf"));
  await open();
  const main = page.getByRole("region", { name: "主阅读区", exact: true });
  await expect(main.locator('[data-page="1"] .textLayer')).toContainText(
    "performance fixture",
  );
  const initialWorkers = workers;
  await open();
  await expect(page.locator(".busy-overlay")).toHaveCount(0);
  await page.getByRole("button", { name: "分屏对照", exact: true }).click();
  const other = page.getByRole("region", { name: "对照阅读区", exact: true });
  await other.getByRole("textbox", { name: "对照页码" }).fill("450");
  await other.getByRole("textbox", { name: "对照页码" }).press("Enter");
  await expect(other.locator('[data-page="450"] .textLayer')).toContainText(
    "page 450",
  );
  expect(workers).toBe(initialWorkers);
  const slots = await page.locator(".page-wrap").count();
  expect(slots).toBeGreaterThanOrEqual(500);
  expect(await page.locator(".page-slot-placeholder").count()).toBeGreaterThan(
    slots - 20,
  );
  await main.getByTitle(/^放大/).click();
  await expect
    .poll(() =>
      main
        .locator('[data-page="1"] canvas')
        .evaluate((node) => (node as HTMLCanvasElement).width),
    )
    .toBeGreaterThan(0);
  const pixels = await page
    .locator(".canvas-host canvas")
    .evaluateAll((canvases) =>
      canvases.map((item) => {
        const canvas = item as HTMLCanvasElement;
        return canvas.width * canvas.height;
      }),
    );
  expect(Math.max(...pixels)).toBeLessThanOrEqual(4_194_304);
  await page.getByRole("button", { name: "分屏对照", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "对照阅读区", exact: true }),
  ).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("progressive mixed-size geometry preserves distant position through split resizing and reload", async ({
  page,
}) => {
  const doc = await PDFDocument.create(),
    font = await doc.embedFont(StandardFonts.Helvetica);
  for (let n = 1; n <= 160; n++) {
    const sheet = doc.addPage(n % 2 ? [595, 842] : [842, 420]);
    sheet.drawText(`Mixed geometry page ${n}`, {
      x: 30,
      y: sheet.getHeight() - 60,
      size: 20,
      font,
    });
  }
  await page.goto("/");
  await page.getByLabel("选择 PDF 文件").setInputFiles({
    name: "mixed-large.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from(await doc.save()),
  });
  const main = page.getByRole("region", { name: "主阅读区", exact: true });
  const input = main.getByRole("textbox", { name: "页码", exact: true });
  await expect(input).toBeVisible();
  await input.fill("140");
  await input.press("Enter");
  await expect(main.locator('[data-page="140"] .textLayer')).toContainText(
    "Mixed geometry page 140",
  );
  // Wait for indexing to reach the end; its changes must not shift the target.
  await expect
    .poll(() =>
      main.locator('[data-page="160"] .pdf-page').evaluate((node) => {
        const rect = node.getBoundingClientRect();
        return Math.round((rect.width / rect.height) * 100);
      }),
    )
    .toBe(200);
  await expect(input).toHaveValue("140");
  await page.getByRole("button", { name: "分屏对照", exact: true }).click();
  const chooser = page.waitForEvent("filechooser");
  await page
    .getByRole("button", { name: "打开 PDF 到阅读区 2", exact: true })
    .click();
  await (await chooser).setFiles(resolve("tests/fixtures/large.pdf"));
  const other = page.getByRole("region", { name: "对照阅读区", exact: true });
  await expect(other.locator('[data-page="1"] .textLayer')).toContainText(
    "performance fixture",
  );
  await other.getByRole("textbox", { name: "对照页码" }).fill("450");
  await other.getByRole("textbox", { name: "对照页码" }).press("Enter");
  await expect(other.locator('[data-page="450"] .textLayer')).toContainText(
    "page 450",
  );
  const separator = page.getByRole("separator", { name: "调整分屏比例" });
  await separator.focus();
  await separator.press("ArrowRight");
  await separator.press("ArrowRight");
  await expect(input).toHaveValue("140");
  await expect
    .poll(() =>
      main.locator('[data-page="140"]').evaluate((node) => {
        const root = node.closest(".reader-scroll")!.getBoundingClientRect();
        const rect = node.getBoundingClientRect();
        return rect.top >= root.top - 5 && rect.top < root.top + 60;
      }),
    )
    .toBe(true);
  await expect(page.getByText("阅读资料已保存")).toBeVisible();
  await page.reload();
  await expect(input).toHaveValue("140");
  await expect(main.locator('[data-page="140"] .textLayer')).toContainText(
    "Mixed geometry page 140",
  );
  await expect(other.getByRole("textbox", { name: "对照页码" })).toHaveValue(
    "450",
  );
});
