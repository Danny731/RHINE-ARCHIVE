import { test, expect } from "@playwright/test";
import { resolve } from "node:path";

test("directory generation and search work without ReadableStream async iteration", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(ReadableStream.prototype, Symbol.asyncIterator, {
      configurable: true,
      value: undefined,
    });
  });
  await page.goto("/");
  await page
    .getByLabel("选择 PDF 文件")
    .setInputFiles(resolve("tests/fixtures/toc-headings.pdf"));
  await expect(page.getByRole("region", { name: "主阅读区" })).toBeVisible();
  await page.getByRole("button", { name: "生成目录", exact: true }).click();
  await page
    .getByRole("combobox", { name: "目录识别方式" })
    .selectOption("headings");
  await page.getByRole("button", { name: "开始生成", exact: true }).click();
  await expect(page.getByText("目录草稿", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("tree", { name: "生成目录树" }).locator(".toc-jump"),
  ).not.toHaveCount(0);
  await page.getByRole("button", { name: "保存使用", exact: true }).click();
  await page.getByRole("button", { name: "搜索", exact: true }).click();
  await page.locator("#pdf-search").fill("第一章");
  await page.locator("#pdf-search").press("Enter");
  await expect(page.locator(".search-result")).not.toHaveCount(0);
  await expect(
    page.getByText(/undefined is not a function|not async iterable/),
  ).toHaveCount(0);
});
