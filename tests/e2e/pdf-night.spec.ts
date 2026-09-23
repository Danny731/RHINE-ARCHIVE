import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { PDFDocument } from "pdf-lib";

const nightFilter = "invert(0.9) hue-rotate(180deg)";
async function toggle(page: Page, dark: boolean) {
  await page.getByRole("button", { name: "应用菜单", exact: true }).click();
  await page
    .getByRole("menuitem", {
      name: dark ? "切换深色界面" : "切换浅色界面",
      exact: true,
    })
    .click();
  await expect(page.locator("html")).toHaveAttribute(
    "data-theme",
    dark ? "dark" : "light",
  );
}

test("raster-only PDF follows night mode without requiring OCR or a text layer", async ({
  page,
}) => {
  await page.goto("/");
  const png = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 64;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "white";
    context.fillRect(0, 0, 64, 64);
    context.fillStyle = "black";
    context.fillRect(8, 8, 48, 4);
    context.fillStyle = "#345dab";
    context.fillRect(8, 24, 20, 20);
    return canvas.toDataURL();
  });
  const pdf = await PDFDocument.create();
  const image = await pdf.embedPng(png);
  pdf
    .addPage([400, 500])
    .drawImage(image, { x: 0, y: 0, width: 400, height: 500 });
  await page
    .getByLabel("选择 PDF 文件")
    .setInputFiles({
      name: "scan.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from(await pdf.save()),
    });
  const paper = page.locator('[data-page="1"] .pdf-page');
  await expect(paper.locator(".ink-layer")).toBeAttached();
  await expect(paper.locator(".textLayer span")).toHaveCount(0);
  const canvas = paper.locator("canvas"),
    original = await canvas.evaluate((node: HTMLCanvasElement) =>
      node.toDataURL(),
    );
  await toggle(page, true);
  await expect(canvas).toHaveCSS("filter", nightFilter);
  expect(
    await canvas.evaluate((node: HTMLCanvasElement) => node.toDataURL()),
  ).toBe(original);
  await toggle(page, false);
  await expect(canvas).toHaveCSS("filter", "none");
});

test("PDF pages, split panes and thumbnails follow the persistent app theme without altering canvas pixels", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "体验示例教材" }).click();
  const main = page.getByRole("region", { name: "主阅读区", exact: true });
  const canvas = main.locator('[data-page="1"] .canvas-host canvas');
  await expect(main.locator('[data-page="1"] .textLayer')).toContainText(
    "Linear algebra begins",
  );
  await expect(canvas).toHaveCSS("filter", "none");
  const original = await canvas.evaluate((node: HTMLCanvasElement) => {
    (window as any).originalCanvas = node;
    return node.toDataURL();
  });
  await toggle(page, true);
  await expect(canvas).toHaveCSS("filter", nightFilter);
  await expect(main.locator('[data-page="1"] .pdf-page')).toHaveCSS(
    "background-color",
    "rgb(26, 26, 26)",
  );
  expect(
    await canvas.evaluate((node) => node === (window as any).originalCanvas),
  ).toBe(true);
  expect(
    await canvas.evaluate((node: HTMLCanvasElement) => node.toDataURL()),
  ).toBe(original);
  await expect(main.locator('[data-page="1"] .textLayer')).toHaveCSS(
    "filter",
    "none",
  );
  await page.getByRole("button", { name: "分屏对照", exact: true }).click();
  const other = page.getByRole("region", { name: "对照阅读区", exact: true });
  await expect(other.locator(".textLayer").first()).not.toBeEmpty();
  await expect(other.locator(".canvas-host canvas").first()).toHaveCSS(
    "filter",
    nightFilter,
  );
  await page.getByTitle("缩略图", { exact: true }).click();
  await expect(page.locator(".thumbnail canvas").first()).toHaveCSS(
    "filter",
    nightFilter,
  );
  await page.getByText("阅读资料已保存", { exact: true }).waitFor();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(main.locator(".canvas-host canvas").first()).toHaveCSS(
    "filter",
    nightFilter,
  );
  await expect(other.locator(".canvas-host canvas").first()).toHaveCSS(
    "filter",
    nightFilter,
  );
  await toggle(page, false);
  await expect(main.locator(".canvas-host canvas").first()).toHaveCSS(
    "filter",
    "none",
  );
  await expect(other.locator(".canvas-host canvas").first()).toHaveCSS(
    "filter",
    "none",
  );
  await expect(main.locator(".pdf-page").first()).toHaveCSS(
    "background-color",
    "rgb(255, 255, 255)",
  );
});

test("night highlights and ink remain visible while stored colors and exported PDF retain original colors", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "体验示例教材" }).click();
  const main = page.getByRole("region", { name: "主阅读区", exact: true });
  await expect(main.locator('[data-page="1"] .textLayer')).toContainText(
    "Linear algebra begins",
  );
  await toggle(page, true);
  await page.getByRole("button", { name: "高亮", exact: true }).click();
  await main
    .locator('[data-page="1"] .textLayer span')
    .filter({ hasText: "Linear algebra begins" })
    .first()
    .evaluate((node) => {
      const range = document.createRange();
      range.selectNodeContents(node);
      const selection = getSelection()!;
      selection.removeAllRanges();
      selection.addRange(range);
      node.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
      selection.removeAllRanges();
    });
  await expect(main.locator(".pdf-mark.highlight").first()).toBeVisible();
  await expect(main.locator(".pdf-mark.highlight").first()).toHaveCSS(
    "mix-blend-mode",
    "normal",
  );
  await page.getByRole("button", { name: "绘制", exact: true }).click();
  // Highlight creation opens the notes panel. Wait for its resize before drawing.
  await expect
    .poll(() =>
      main.locator('[data-page="1"] .pdf-page').evaluate((node) => {
        const root = node.closest(".reader-scroll")!;
        return Math.abs(
          node.getBoundingClientRect().width -
            Math.min(1224, root.clientWidth - 48),
        );
      }),
    )
    .toBeLessThan(2);
  const ink = main.locator('[data-page="1"] .ink-layer');
  await expect(ink).toHaveCSS("filter", nightFilter);
  await page.getByLabel("画笔颜色").fill("#000000");
  let bounds = (await ink.boundingBox())!;
  await page.mouse.click(bounds.x + 60, bounds.y + 70);
  await expect(ink.locator("[data-ink-id]")).toHaveCount(1);
  await page.getByLabel("画笔颜色").fill("#2030ec");
  await page.getByLabel("画笔粗细").selectOption("8");
  bounds = (await ink.boundingBox())!;
  await page.mouse.move(bounds.x + 65, bounds.y + 110);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 140, bounds.y + 140, { steps: 8 });
  await page.mouse.up();
  await expect(ink.locator("[data-ink-id]")).toHaveCount(2);
  await expect
    .poll(() =>
      page.evaluate(() =>
        JSON.parse(
          localStorage.getItem("pagewise-library") || "{}",
        ).books?.[0]?.inkStrokes?.map((s: any) => s.color),
      ),
    )
    .toEqual(["#000000", "#2030ec"]);
  await page.getByTitle("搜索", { exact: true }).click();
  await page.getByPlaceholder("在本书中搜索…").fill("Linear");
  await expect(main.locator(".textLayer .search-hit").first()).toBeVisible();
  await expect(main.locator(".textLayer .search-hit").first()).toHaveCSS(
    "background-color",
    "rgba(238, 188, 81, 0.4)",
  );
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出手写 PDF", exact: true }).click();
  const bytes = await readFile((await (await download).path())!);
  await page
    .getByLabel("选择 PDF 文件")
    .setInputFiles({
      name: "night-export.pdf",
      mimeType: "application/pdf",
      buffer: bytes,
    });
  await expect(
    page.getByRole("tab", { name: "night-export", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(main.locator('[data-page="1"] .textLayer')).toContainText(
    "Linear algebra begins",
  );
  const exported = main.locator('[data-page="1"] .canvas-host canvas');
  await expect(exported).toHaveCSS("filter", nightFilter);
  const colors = await exported.evaluate((node: HTMLCanvasElement) => {
    const data = node
      .getContext("2d")!
      .getImageData(0, 0, node.width, node.height).data;
    let blue = 0,
      white = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] < 50 && data[i + 1] < 70 && data[i + 2] > 220) blue++;
      if (data[i] > 245 && data[i + 1] > 245 && data[i + 2] > 245) white++;
    }
    return { blue, white };
  });
  expect(colors.blue).toBeGreaterThan(100);
  expect(colors.white).toBeGreaterThan(10000);
  await toggle(page, false);
  await expect(exported).toHaveCSS("filter", "none");
});
