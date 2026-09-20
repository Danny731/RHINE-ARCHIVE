import { test, expect, type Page } from "@playwright/test";
import { resolve } from "node:path";

async function create(page: Page, name: string) {
  await page.getByRole("button", { name: "新建合集", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "新建合集", exact: true });
  await dialog.getByRole("textbox", { name: "合集名称" }).fill(name);
  await dialog.getByRole("button", { name: "创建合集", exact: true }).click();
  await expect(dialog).toHaveCount(0);
}
const category = (page: Page, name: string) =>
  page
    .getByRole("navigation", { name: "书架分类" })
    .getByRole("button", { name: new RegExp(`^${name} `) });
const lib = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem("pagewise-library")!));

test("collections import PDFs, support multiple membership, rename, filter and survive backup restore", async ({
  page,
  browser,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await create(page, "数学");
  await expect(page.getByText("这个合集还没有书")).toBeVisible();
  const picker = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "导入 PDF 到合集" }).click();
  await (await picker).setFiles(resolve("tests/fixtures/toc-headings.pdf"));
  await expect(page.getByRole("region", { name: "主阅读区" })).toBeVisible();
  await page.getByTitle("返回书架", { exact: true }).click();
  await expect(category(page, "数学")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".book-card")).toHaveCount(1);
  await expect
    .poll(async () => (await lib(page)).collections[0].bookIds.length)
    .toBe(1);
  expect(
    await page.evaluate(() =>
      localStorage.getItem("pagewise-library-before-shelf-v1"),
    ),
  ).not.toBeNull();

  await create(page, "复习");
  await page.getByRole("button", { name: "管理合集书籍" }).click();
  let dialog = page.getByRole("dialog", { name: "管理合集书籍" });
  await dialog.getByRole("checkbox", { name: "toc-headings" }).check();
  await dialog.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.locator(".book-card")).toHaveCount(1);
  await page.getByRole("button", { name: "重命名合集" }).click();
  await page.setViewportSize({ width: 900, height: 620 });
  dialog = page.getByRole("dialog", { name: "重命名合集" });
  await dialog.getByRole("textbox", { name: "合集名称" }).fill("数学");
  await dialog.getByRole("button", { name: "保存", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("同名");
  await dialog.getByRole("textbox", { name: "合集名称" }).fill("考前复习");
  await dialog.getByRole("button", { name: "保存", exact: true }).click();
  await page.getByRole("textbox", { name: "查找书籍" }).fill("没有这本书");
  await expect(page.locator(".book-card")).toHaveCount(0);
  await page.getByRole("textbox", { name: "查找书籍" }).fill("headings");
  await expect(page.locator(".book-card")).toHaveCount(1);
  await expect
    .poll(async () => (await lib(page)).collections?.[1]?.name)
    .toBe("考前复习");
  await page.reload();
  await expect(category(page, "数学")).toBeVisible();
  await expect(category(page, "考前复习")).toBeVisible();
  const backup = await lib(page);
  expect(
    backup.collections.map((c: { bookIds: string[] }) => c.bookIds.length),
  ).toEqual([1, 1]);
  const context = await browser.newContext();
  const restored = await context.newPage();
  await restored.goto("/");
  await restored.getByLabel("选择备份文件").setInputFiles({
    name: "shelf.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(backup)),
  });
  await expect(category(restored, "数学")).toBeVisible();
  await category(restored, "考前复习").click();
  await expect(restored.locator(".book-card")).toHaveCount(1);
  await context.close();
  await category(page, "考前复习").click();
  await page.getByRole("button", { name: "移出合集", exact: true }).click();
  await expect(page.locator(".book-card")).toHaveCount(0);
  await category(page, "数学").click();
  await expect(page.locator(".book-card")).toHaveCount(1);
  await page.getByRole("button", { name: "删除合集", exact: true }).click();
  await page.getByRole("button", { name: "确认删除合集" }).click();
  await expect(category(page, "数学")).toHaveCount(0);
  await category(page, "未分类").click();
  await expect(page.locator(".book-card")).toHaveCount(1);
  expect(errors).toEqual([]);
});

test("shelf removal can be undone or restored after restart without losing notes or cached PDFs", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByLabel("选择 PDF 文件")
    .setInputFiles(resolve("tests/fixtures/toc-headings.pdf"));
  await expect(page.getByRole("region", { name: "主阅读区" })).toBeVisible();
  await page.getByRole("textbox", { name: "页码", exact: true }).fill("4");
  await page.getByRole("textbox", { name: "页码", exact: true }).press("Enter");
  await page.getByTitle("切换笔记面板").click();
  await page
    .getByRole("textbox", { name: "新笔记" })
    .fill("保留在已移除书籍中的笔记");
  await page.getByRole("button", { name: "添加笔记", exact: true }).click();
  await expect(page.getByText("阅读资料已保存")).toBeVisible();
  await page.getByTitle("返回书架", { exact: true }).click();
  await create(page, "教材");
  await category(page, "全部书籍").click();
  await page.getByRole("button", { name: "加入 / 管理合集" }).click();
  let dialog = page.getByRole("dialog", { name: "管理书籍合集" });
  await dialog.getByRole("checkbox", { name: "教材" }).check();
  await dialog.getByRole("button", { name: "保存", exact: true }).click();
  const remove = async () => {
    await page.getByRole("button", { name: "从书架移除", exact: true }).click();
    dialog = page.getByRole("dialog", { name: "从书架移除" });
    await expect(dialog).toContainText("不会删除原 PDF");
    await dialog.getByRole("button", { name: "确认移除" }).click();
    await expect(page.locator(".book-card")).toHaveCount(0);
  };
  await remove();
  await page.getByRole("button", { name: "撤销移除" }).click();
  await expect(page.locator(".book-card")).toHaveCount(1);
  await remove();
  await expect
    .poll(async () => (await lib(page)).books[0].removedAt)
    .toBeGreaterThan(0);
  await page.reload();
  await expect(page.locator(".book-card")).toHaveCount(0);
  await category(page, "已移除").click();
  await expect(page.locator(".book-card")).toHaveCount(1);
  await page.getByRole("button", { name: "恢复到书架", exact: true }).click();
  await category(page, "教材").click();
  await expect(page.locator(".book-card")).toHaveCount(1);
  await page.locator(".book-card").click();
  await expect(
    page.getByRole("textbox", { name: "页码", exact: true }),
  ).toHaveValue("4");
  await page.getByTitle("切换笔记面板").click();
  await expect(page.locator(".note-card textarea")).toHaveValue(
    "保留在已移除书籍中的笔记",
  );
});
