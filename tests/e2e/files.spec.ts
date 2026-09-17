import { test, expect } from "@playwright/test";
import { resolve } from "node:path";
test("large local PDF stays virtualized and restores the last page", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByLabel("选择 PDF 文件")
    .setInputFiles(resolve("tests/fixtures/large.pdf"));
  const main = page.getByRole("region", { name: "主阅读区" });
  await expect(main.locator(".textLayer").first()).toContainText(
    "performance fixture",
  );
  await main.getByRole("textbox", { name: "页码", exact: true }).fill("450");
  await main.getByRole("textbox", { name: "页码", exact: true }).press("Enter");
  await expect(main.locator('[data-page="450"] .textLayer')).toContainText(
    "page 450",
  );
  await expect.poll(() => main.locator("canvas").count()).toBeLessThan(8);
  await expect
    .poll(() =>
      main
        .locator('[data-page="450"] canvas')
        .evaluate((c) => (c as HTMLCanvasElement).width),
    )
    .toBeGreaterThan(0);
  await page.getByTitle("缩略图", { exact: true }).click();
  await expect(page.locator(".thumbnail")).toHaveCount(500);
  await expect
    .poll(() => page.locator(".thumbnail canvas").count())
    .toBeLessThan(12);
  await page.getByTitle("目录", { exact: true }).click();
  await expect(page.getByText("阅读资料已保存")).toBeVisible();
  await page.reload();
  await page.locator(".book-card").first().click();
  await expect(
    main.getByRole("textbox", { name: "页码", exact: true }),
  ).toHaveValue("450");
  await expect(main.locator('[data-page="450"] .textLayer')).toContainText(
    "page 450",
  );
  await page.screenshot({ path: "test-results/large-reader.png" });
});
test("Chinese PDFs, mixed paper sizes, rotation, and bad-file recovery", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page
    .getByLabel("选择 PDF 文件")
    .setInputFiles(resolve("tests/fixtures/中文混合页面.pdf"));
  const main = page.getByRole("region", { name: "主阅读区" });
  await expect(main.locator('[data-page="1"] .textLayer')).toContainText(
    "向量相加",
  );
  await page.getByRole("combobox", { name: "阅读模式" }).selectOption("single");
  await main.getByRole("textbox", { name: "页码", exact: true }).fill("3");
  await main.getByRole("textbox", { name: "页码", exact: true }).press("Enter");
  await expect(main.locator(".textLayer")).toContainText("教材测试");
  await expect
    .poll(() =>
      main.locator("canvas").evaluate((c) => (c as HTMLCanvasElement).width),
    )
    .toBeGreaterThan(0);
  await page.screenshot({ path: "test-results/chinese-rotated.png" });
  await page.getByRole("button", { name: "高亮", exact: true }).click();
  await main
    .locator(".textLayer span")
    .filter({ hasText: "教材测试" })
    .first()
    .evaluate((el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      const selection = window.getSelection()!;
      selection.removeAllRanges();
      selection.addRange(range);
      el.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    });
  await expect(page.locator(".note-card")).toHaveCount(1);
  await expect(main.locator(".pdf-mark.highlight")).not.toHaveCount(0);
  await page.getByRole("button", { name: "切换笔记面板" }).click();
  await main.getByTitle("旋转页面", { exact: true }).click();
  await expect(main.locator(".textLayer")).toContainText("教材测试");
  await expect
    .poll(() =>
      main.locator("canvas").evaluate((c) => (c as HTMLCanvasElement).width),
    )
    .toBeGreaterThan(0);
  await page.getByLabel("选择 PDF 文件").setInputFiles({
    name: "broken.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("not a pdf"),
  });
  await expect(page.getByRole("status")).toContainText("打开失败");
  await expect(main).toBeVisible();
  expect(errors).toEqual([]);
});
