import { test, expect, type Page } from "@playwright/test";

const titles = [
  "机器人学基础",
  "机器人学习题解答",
  "线性代数学习笔记",
  "控制系统导论",
  "机械设计课程讲义",
  "概率与统计基础",
];
const seed = {
  version: 1,
  dark: false,
  books: titles.map((title, index) => ({
    id: `theme-fixture-${index}`,
    title,
    source: "file",
    pages: 286,
    opened: 100 - index,
    path: `D:/synthetic-fixtures/${title}.pdf`,
    position: { page: 10 + index * 7, offset: 0, zoom: 0, rotation: 0 },
    secondary: { page: 2, offset: 0, zoom: 0, rotation: 0 },
    mode: "continuous",
    split: false,
    pageOffset: 0,
    bookmarks: [],
    marks: [],
  })),
  collections: [
    {
      id: "robotics",
      name: "机器人学",
      bookIds: ["theme-fixture-0", "theme-fixture-1"],
    },
    {
      id: "math",
      name: "数学基础",
      bookIds: ["theme-fixture-2", "theme-fixture-5"],
    },
  ],
};
async function setup(page: Page) {
  await page.addInitScript((data) => {
    if (!sessionStorage.getItem("theme-seeded")) {
      localStorage.setItem("pagewise-library", JSON.stringify(data));
      sessionStorage.setItem("theme-seeded", "1");
    }
  }, seed);
  await page.goto("/");
  await expect(page.locator(".book-card")).toHaveCount(6);
}
async function withinViewport(page: Page, selector: string) {
  return page.locator(selector).evaluate((element) => {
    const b = element.getBoundingClientRect();
    return (
      b.left >= -1 &&
      b.top >= -1 &&
      b.right <= window.innerWidth + 1 &&
      b.bottom <= window.innerHeight + 1
    );
  });
}

test("archive theme preserves navigation and card/list actions at desktop and minimum window sizes", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1600, height: 1000 });
  await setup(page);
  await expect(page.getByRole("img", { name: "莱茵生命 Logo" })).toBeVisible();
  await expect(page.getByText("PER ASPERA", { exact: true })).toBeVisible();
  await expect(page.getByText("AD ASTRA", { exact: true })).toBeVisible();
  expect(await withinViewport(page, ".archive-rail")).toBe(true);
  expect(await withinViewport(page, ".archive-main")).toBe(true);
  await page.getByRole("button", { name: "列表", exact: true }).click();
  await expect(page.locator(".book-grid")).toHaveClass(/book-list/);
  await expect(page.locator(".book-card")).toHaveCount(6);
  await page.getByRole("textbox", { name: "查找书籍" }).fill("机器人");
  await expect(page.locator(".book-card")).toHaveCount(2);
  await page.getByRole("textbox", { name: "查找书籍" }).fill("");
  await page.setViewportSize({ width: 900, height: 620 });
  await page.getByRole("button", { name: "档案卡片", exact: true }).click();
  expect(await withinViewport(page, ".home-header")).toBe(true);
  expect(await withinViewport(page, ".archive-main")).toBe(true);
  expect(
    await page
      .locator(".archive-main")
      .evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
  ).toBe(true);
  await page.getByRole("button", { name: "新建合集", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "新建合集", exact: true });
  await dialog.getByRole("textbox", { name: "合集名称" }).fill("界面验证合集");
  await dialog.getByRole("button", { name: "创建合集", exact: true }).click();
  await expect(page.getByText("这个合集还没有书")).toBeVisible();
  await page
    .getByRole("button", { name: "选择文件", exact: true })
    .scrollIntoViewIfNeeded();
  await expect(
    page.getByRole("button", { name: "选择文件", exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("dark theme persists while PDF colors remain unchanged and split controls remain reachable", async ({
  page,
}) => {
  await setup(page);
  const mark = page.getByRole("img", { name: "莱茵生命 Logo" });
  await page.getByTitle("切换深色界面", { exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(mark).toHaveCSS("filter", "invert(1)");
  await expect(
    page.locator('.collection-tabs button[aria-pressed="true"]'),
  ).toHaveCSS("color", "rgb(232, 228, 218)");
  await expect(page.locator(".archive-import")).toHaveCSS(
    "background-color",
    "rgb(215, 200, 174)",
  );
  await expect
    .poll(() =>
      page.evaluate(
        () => JSON.parse(localStorage.getItem("pagewise-library")!).dark,
      ),
    )
    .toBe(true);
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "体验示例教材", exact: true }).click();
  await expect(
    page.locator(".pdf-page").first().locator("canvas"),
  ).toBeVisible();
  await expect(page.locator(".pdf-page").first()).toHaveCSS(
    "background-color",
    "rgb(255, 255, 255)",
  );
  await page.getByRole("button", { name: "分屏对照", exact: true }).click();
  await expect(page.locator(".workspace-group")).toHaveCount(2);
  await page.getByTitle("切换笔记面板").click();
  await page.setViewportSize({ width: 900, height: 620 });
  expect(await withinViewport(page, ".notes-panel")).toBe(true);
  expect(await withinViewport(page, ".tab-workspace")).toBe(true);
  await page
    .getByRole("textbox", { name: "新笔记" })
    .fill("深色主题不改变笔记功能");
  await page.getByRole("button", { name: "添加笔记", exact: true }).click();
  await expect(page.locator(".note-card textarea")).toHaveValue(
    "深色主题不改变笔记功能",
  );
  await page.getByTitle("设置与备份", { exact: true }).click();
  await page.getByText("关于莱茵档案", { exact: true }).click();
  await expect(page.getByText(/标志权利归各自权利人所有/)).toBeVisible();
});
