import { test, expect, type Page } from "@playwright/test";
import { resolve } from "node:path";
import { readFile } from "node:fs/promises";

async function open(page: Page, name: string) {
  await page.goto("/");
  await page
    .getByLabel("选择 PDF 文件")
    .setInputFiles(resolve(`tests/fixtures/${name}.pdf`));
  await expect(page.getByRole("region", { name: "主阅读区" })).toBeVisible();
}
async function generate(page: Page, mode = "auto") {
  await page.getByRole("button", { name: "生成目录", exact: true }).click();
  await page.getByRole("combobox", { name: "目录识别方式" }).selectOption(mode);
  await page.getByRole("button", { name: "开始生成", exact: true }).click();
}
test("printed contents: actual pages, hierarchy, edits, preservation, backup and reload", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await open(page, "toc-printed");
  await generate(page);
  await expect(page.getByText("目录草稿", { exact: true })).toBeVisible();
  const tree = page.getByRole("tree", { name: "生成目录树" }),
    main = page.getByRole("region", { name: "主阅读区" });
  await expect(tree.locator(".toc-jump")).toHaveCount(6);
  await tree
    .getByRole("button", { name: "第一章 向量 4", exact: true })
    .click();
  await expect(
    main.getByRole("textbox", { name: "页码", exact: true }),
  ).toHaveValue("4");
  await tree.locator(".toc-jump").filter({ hasText: "1.1 向量空间与" }).click();
  await expect(
    main.getByRole("textbox", { name: "页码", exact: true }),
  ).toHaveValue("5");
  await expect
    .poll(() =>
      main.locator('[data-page="5"] .pdf-page').evaluate((el) => {
        const line = [...el.querySelectorAll(".textLayer span")].find((n) =>
          n.textContent?.includes("1.1 向量空间"),
        );
        if (!line) return false;
        const r = line.getBoundingClientRect(),
          root = el.closest(".reader-scroll")!.getBoundingClientRect();
        return r.top >= root.top - 10 && r.top < root.top + 130;
      }),
    )
    .toBe(true);
  await expect(
    tree.locator(".toc-jump").filter({ hasText: "尚未收录" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "保存使用", exact: true }).click();
  await tree.getByTitle("编辑目录：第一章 向量", { exact: true }).click();
  await page
    .getByRole("textbox", { name: "目录标题", exact: true })
    .fill("第一章 向量 · 我的重点");
  await page.getByRole("button", { name: "应用修改", exact: true }).click();
  await page.getByRole("button", { name: "保存使用", exact: true }).click();
  const download = page.waitForEvent("download");
  await page.getByTitle("设置与备份", { exact: true }).click();
  await page.getByRole("button", { name: "导出备份", exact: true }).click();
  const file = await download;
  const backup = JSON.parse(await readFile((await file.path())!, "utf8"));
  expect(
    backup.books[0].generatedToc.nodes.some(
      (n: { title: string }) => n.title === "第一章 向量 · 我的重点",
    ),
  ).toBe(true);
  await page.getByTitle("关闭设置").click();
  await expect(page.getByText("阅读资料已保存")).toBeVisible();
  await page.reload();
  await expect(
    tree.locator(".toc-jump").filter({ hasText: "我的重点" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "重新生成", exact: true }).click();
  await page.getByRole("button", { name: "开始生成", exact: true }).click();
  await expect(page.getByText("目录草稿", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "放弃草稿", exact: true }).click();
  await expect(
    tree.locator(".toc-jump").filter({ hasText: "我的重点" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "分屏对照" }).click();
  await page
    .getByRole("combobox", { name: "目录跳转区域" })
    .selectOption("secondary");
  await tree.locator(".toc-jump").filter({ hasText: "2.1 矩阵乘法" }).click();
  await expect(page.getByRole("textbox", { name: "对照页码" })).toHaveValue(
    "8",
  );
  await expect(
    main.getByRole("textbox", { name: "页码", exact: true }),
  ).toHaveValue("5");
  await page.screenshot({ path: "test-results/auto-toc.png" });
  expect(errors).toEqual([]);
});

test("a changed file with the same embedded ID invalidates saved targets", async ({
  page,
}) => {
  await open(page, "toc-printed");
  await generate(page);
  await page.getByRole("button", { name: "保存使用", exact: true }).click();
  await expect(page.getByText("阅读资料已保存")).toBeVisible();
  await page
    .getByLabel("选择 PDF 文件")
    .setInputFiles(resolve("tests/fixtures/toc-printed-updated.pdf"));
  await expect(page.locator(".toc-warning")).toContainText("文件内容已变化");
  await expect(
    page.locator(".toc-jump").filter({ hasText: "第一章 向量" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "重新生成", exact: true }).click();
  await page.getByRole("button", { name: "开始生成", exact: true }).click();
  await expect(page.getByText("目录草稿", { exact: true })).toBeVisible();
  await expect(
    page.locator(".toc-jump").filter({ hasText: "第一章 向量" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "保存使用", exact: true }).click();
  await expect(page.locator(".toc-warning")).toHaveCount(0);
});

test("replacing a saved directory can be undone and parent targets remain editable", async ({
  page,
}) => {
  await open(page, "toc-headings");
  await generate(page, "headings");
  await page.getByRole("button", { name: "保存使用", exact: true }).click();
  await page.getByTitle("编辑目录：第一章 向量", { exact: true }).click();
  await page
    .getByRole("textbox", { name: "目录标题", exact: true })
    .fill("手工修正的第一章");
  await page.getByRole("button", { name: "应用修改", exact: true }).click();
  await page.getByRole("button", { name: "保存使用", exact: true }).click();
  await page.getByRole("button", { name: "重新生成", exact: true }).click();
  await page.getByRole("button", { name: "开始生成", exact: true }).click();
  await expect(page.getByText("目录草稿", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "保存使用", exact: true }).click();
  await expect(
    page.locator(".toc-jump").filter({ hasText: "手工修正" }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "恢复上一版目录", exact: true })
    .click();
  await expect(
    page.locator(".toc-jump").filter({ hasText: "手工修正" }),
  ).toBeVisible();
  await page
    .getByTitle("编辑目录：1.1 向量空间与线性变换", { exact: true })
    .click();
  await page.getByRole("combobox", { name: "上级章节" }).selectOption("");
  await page.getByRole("button", { name: "应用修改", exact: true }).click();
  await page.getByRole("button", { name: "保存使用", exact: true }).click();
  await expect(
    page.getByRole("treeitem").filter({
      has: page.locator(".toc-jump").filter({ hasText: "1.1 向量空间" }),
    }),
  ).toHaveAttribute("aria-level", "1");
});

test("body headings, collapse/filter, manual corrections, and backup import", async ({
  page,
  browser,
}) => {
  await open(page, "toc-headings");
  await generate(page, "headings");
  const tree = page.getByRole("tree", { name: "生成目录树" });
  await expect(tree.locator(".toc-jump")).toHaveCount(4);
  await tree.getByTitle("折叠章节", { exact: true }).first().click();
  await expect(tree.locator(".toc-jump")).toHaveCount(3);
  await page.getByRole("textbox", { name: "查找目录" }).fill("线性变换");
  await expect(tree.locator(".toc-jump")).toHaveCount(2);
  await page.getByRole("textbox", { name: "查找目录" }).fill("");
  await page.getByRole("button", { name: "保存使用", exact: true }).click();
  await page.getByTitle("手动添加目录", { exact: true }).click();
  await page
    .getByRole("textbox", { name: "目录标题", exact: true })
    .fill("复习入口");
  await page.getByRole("textbox", { name: "目录目标页码" }).fill("4");
  await page.getByRole("button", { name: "应用修改", exact: true }).click();
  await page.getByRole("button", { name: "保存使用", exact: true }).click();
  await tree.locator(".toc-jump").filter({ hasText: "复习入口" }).click();
  await expect(
    page.getByRole("textbox", { name: "页码", exact: true }),
  ).toHaveValue("4");
  const dl = page.waitForEvent("download");
  await page.getByTitle("设置与备份").click();
  await page.getByRole("button", { name: "导出备份", exact: true }).click();
  const backup = await readFile((await (await dl).path())!);
  const other = await browser.newContext();
  const restored = await other.newPage();
  await restored.goto("/");
  await restored.getByLabel("选择备份文件").setInputFiles({
    name: "backup.json",
    mimeType: "application/json",
    buffer: backup,
  });
  await expect(restored.getByRole("tab")).toHaveCount(1);
  await restored
    .getByLabel("选择 PDF 文件")
    .setInputFiles(resolve("tests/fixtures/toc-headings.pdf"));
  await expect(
    restored
      .getByRole("tree", { name: "生成目录树" })
      .locator(".toc-jump")
      .filter({ hasText: "复习入口" }),
  ).toBeVisible();
  await other.close();
});

test("image-only fallback and manual directory persist", async ({ page }) => {
  await open(page, "toc-no-text");
  await generate(page);
  await expect(page.locator(".toc-message")).toContainText("OCR");
  await expect(page.getByRole("tree", { name: "生成目录树" })).toHaveCount(0);
  await page.getByTitle("手动添加目录", { exact: true }).click();
  await page
    .getByRole("textbox", { name: "目录标题", exact: true })
    .fill("手动第一章");
  await page.getByRole("textbox", { name: "目录目标页码" }).fill("2");
  await page.getByRole("button", { name: "应用修改", exact: true }).click();
  await page.getByRole("button", { name: "保存使用", exact: true }).click();
  await expect(page.getByText("阅读资料已保存")).toBeVisible();
  await page.reload();
  await page.locator(".toc-jump").filter({ hasText: "手动第一章" }).click();
  await expect(
    page.getByRole("textbox", { name: "页码", exact: true }),
  ).toHaveValue("2");
});

test("an older saved directory shows a regeneration notice without discarding edits", async ({
  page,
}) => {
  await open(page, "toc-headings");
  await generate(page, "headings");
  await page.getByRole("button", { name: "保存使用", exact: true }).click();
  await expect(page.getByText("阅读资料已保存")).toBeVisible();
  const legacy = await page.evaluate(() => {
    const lib = JSON.parse(localStorage.getItem("pagewise-library")!);
    lib.books[0].generatedToc.analyzerVersion = "1.0.0";
    lib.books[0].generatedToc.nodes[0].title = "保留手工目录";
    return lib;
  });
  await page.addInitScript(
    (lib) => localStorage.setItem("pagewise-library", JSON.stringify(lib)),
    legacy,
  );
  await page.reload();
  await expect(page.getByTestId("toc-algorithm-update")).toBeVisible();
  await expect(
    page.locator(".toc-jump").filter({ hasText: "保留手工目录" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "重新生成", exact: true }).click();
  await page.getByRole("button", { name: "开始生成", exact: true }).click();
  await expect(page.getByText("目录草稿", { exact: true })).toBeVisible();
  await expect(page.getByTestId("toc-algorithm-update")).toHaveCount(0);
  await page.getByRole("button", { name: "放弃草稿", exact: true }).click();
  await expect(
    page.locator(".toc-jump").filter({ hasText: "保留手工目录" }),
  ).toBeVisible();
});

test("generation cancellation leaves saved data intact and changing books isolates jobs", async ({
  page,
}) => {
  await open(page, "large");
  await generate(page);
  await page.getByRole("button", { name: "取消生成", exact: true }).click();
  await expect(page.locator(".toc-message")).toContainText("已取消生成");
  await expect(
    page.getByRole("button", { name: "保存使用", exact: true }),
  ).toHaveCount(0);
  await generate(page);
  await page
    .getByLabel("选择 PDF 文件")
    .setInputFiles(resolve("tests/fixtures/toc-no-text.pdf"));
  await expect(page.locator(".document-title strong")).toHaveText(
    "toc-no-text",
  );
  await expect(
    page.getByRole("button", { name: "取消生成", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "保存使用", exact: true }),
  ).toHaveCount(0);
});
