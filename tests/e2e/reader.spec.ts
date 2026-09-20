import { test, expect } from "@playwright/test";
test("offline reader: navigation, search, annotations, comparison and persistence", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "阅读档案 ARCHIVE INDEX" }),
  ).toBeVisible();
  await page.screenshot({ path: "test-results/home.png" });
  await page.getByRole("button", { name: "体验示例教材" }).click();
  await expect(page.getByRole("region", { name: "主阅读区" })).toBeVisible();
  const main = page.getByRole("region", { name: "主阅读区" });
  await expect(main.locator(".textLayer").first()).toContainText(
    "Linear algebra begins",
  );
  await expect(page.locator(".outline-item")).toHaveCount(8);
  await page.locator(".outline-item").filter({ hasText: "Exercises" }).click();
  await expect(
    main.getByRole("textbox", { name: "页码", exact: true }),
  ).toHaveValue("7");
  await page.getByRole("button", { name: "切换书签", exact: true }).click();
  await page.getByRole("button", { name: "书签", exact: true }).click();
  await expect(page.locator(".bookmark-row")).toHaveCount(1);
  await page.getByRole("button", { name: "分屏对照" }).click();
  const secondary = page.getByRole("region", { name: "对照阅读区" });
  await secondary.getByRole("textbox", { name: "对照页码" }).fill("8");
  await secondary.getByRole("textbox", { name: "对照页码" }).press("Enter");
  await expect(secondary.locator(".textLayer")).toContainText(
    "Worked solutions",
  );
  await expect(
    main.getByRole("textbox", { name: "页码", exact: true }),
  ).toHaveValue("7");
  await page.getByRole("button", { name: "框选", exact: true }).click();
  const sheet = main.locator('[data-page="7"] .area-layer');
  await expect(sheet).toBeVisible();
  const rect = await sheet.boundingBox();
  if (!rect) throw new Error("Missing PDF page");
  await page.mouse.move(rect.x + 30, rect.y + 30);
  await page.mouse.down();
  await page.mouse.move(rect.x + 180, rect.y + 100, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator(".note-card")).toHaveCount(1);
  await page
    .locator(".note-card textarea")
    .fill("对照答案，注意向量相加的顺序。");
  await page
    .getByRole("textbox", { name: "新笔记" })
    .fill("复习第 7 页的练习题");
  await page.getByRole("button", { name: "添加笔记", exact: true }).click();
  await expect(page.locator(".note-card")).toHaveCount(2);
  await page.getByRole("button", { name: "切换笔记面板" }).click();
  await page.getByRole("button", { name: "分屏对照" }).click();
  await page.getByRole("button", { name: "搜索", exact: true }).click();
  await page.locator("#pdf-search").fill("perpendicular");
  await page.locator("#pdf-search").press("Enter");
  await expect(page.locator(".search-result")).toHaveCount(2);
  await page.locator(".search-result").first().click();
  await expect(
    main.getByRole("textbox", { name: "页码", exact: true }),
  ).toHaveValue("6");
  await expect(main.locator('[data-page="6"] .textLayer')).toContainText(
    "perpendicular",
  );
  await page.getByRole("button", { name: "高亮", exact: true }).click();
  await main
    .locator('[data-page="6"] .textLayer span')
    .filter({ hasText: "The dot product of" })
    .first()
    .evaluate((el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      const selection = window.getSelection()!;
      selection.removeAllRanges();
      selection.addRange(range);
      el.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    });
  await expect(page.locator(".note-card")).toHaveCount(3);
  await expect(
    main.locator('[data-page="6"] .pdf-mark.highlight'),
  ).not.toHaveCount(0);
  await page.getByRole("button", { name: "切换笔记面板" }).click();
  await main.getByRole("button", { name: "放大", exact: true }).click();
  await expect(main.locator('[data-page="6"] .textLayer')).toContainText(
    "dot product",
  );
  await main.getByTitle("旋转页面", { exact: true }).click();
  await expect(main.locator('[data-page="6"] .textLayer')).toContainText(
    "dot product",
  );
  await main.getByTitle("旋转页面", { exact: true }).click();
  await main.getByTitle("旋转页面", { exact: true }).click();
  await main.getByTitle("旋转页面", { exact: true }).click();
  await main.getByTitle("点击适合宽度").click();
  await page.getByRole("button", { name: "选择", exact: true }).click();
  await page.getByTitle("设置与备份", { exact: true }).click();
  await page.getByRole("textbox", { name: "印刷页码" }).fill("1");
  await page.getByRole("button", { name: "应用", exact: true }).click();
  await page.getByTitle("关闭设置").click();
  await expect(
    main.getByRole("textbox", { name: "页码", exact: true }),
  ).toHaveValue("1");
  await page.screenshot({ path: "test-results/reader.png" });
  await expect(page.getByText("阅读资料已保存")).toBeVisible();
  await page.reload();
  await expect(
    main.getByRole("textbox", { name: "页码", exact: true }),
  ).toHaveValue("1");
  await expect(
    main.locator('[data-page="6"] .pdf-mark.highlight'),
  ).not.toHaveCount(0);
  await page.getByRole("button", { name: "切换笔记面板" }).click();
  await expect(page.locator(".note-card")).toHaveCount(3);
  await expect(
    page
      .locator(".note-card textarea")
      .filter({ hasText: "复习第 7 页的练习题" }),
  ).toHaveCount(1);
  await expect(main.locator("canvas")).not.toHaveCount(8);
  expect(errors).toEqual([]);
});
