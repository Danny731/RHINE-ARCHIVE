import { test, expect } from "@playwright/test";
import { resolve } from "node:path";

test("headerless reader keeps toolbar and menu reachable at minimum width and through split/theme changes", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 900, height: 620 });
  await page.goto("/");
  await page.getByRole("button", { name: "体验示例教材" }).click();
  const toolbar = page.getByRole("region", { name: "阅读工具栏" });
  const trigger = toolbar.getByRole("button", { name: "应用菜单" });
  await expect(toolbar).toBeVisible();
  await expect(page.locator(".reading-header, .document-title")).toHaveCount(0);
  expect(
    await toolbar.evaluate((node) => ({
      height: node.getBoundingClientRect().height,
      overflow: node.scrollWidth > node.clientWidth,
    })),
  ).toEqual({ height: 48, overflow: false });
  await expect(
    toolbar.getByRole("img", { name: "莱茵生命 Logo" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "分屏对照", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "对照阅读区", exact: true }),
  ).toBeVisible();
  await trigger.click();
  const menu = page.getByRole("menu", { name: "应用操作" });
  expect(
    await menu.evaluate((node) => {
      const box = node.getBoundingClientRect();
      return (
        box.left >= 0 && box.right <= innerWidth && box.bottom <= innerHeight
      );
    }),
  ).toBe(true);
  await menu.getByRole("menuitem", { name: "切换深色界面" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(toolbar.getByRole("img", { name: "莱茵生命 Logo" })).toHaveCSS(
    "filter",
    "invert(1)",
  );
  await expect(trigger).toBeFocused();
  await expect(menu).toHaveCount(0);
  await trigger.click();
  await menu.getByRole("menuitem", { name: "设置与备份" }).click();
  await expect(page.getByRole("dialog", { name: "阅读设置" })).toBeVisible();
  await page.getByTitle("关闭设置").click();
  await trigger.click();
  const chooser = page.waitForEvent("filechooser");
  await menu.getByRole("menuitem", { name: /打开 PDF/ }).click();
  await (await chooser).setFiles(resolve("tests/fixtures/toc-headings.pdf"));
  await expect(
    page.locator(
      '.workspace-group.is-active [role="tab"][aria-selected="true"]',
    ),
  ).toHaveAttribute("aria-label", "toc-headings");
  await expect(menu).toHaveCount(0);
  await page.getByTitle("返回书架", { exact: true }).click();
  await expect(
    page.getByRole("heading", { name: /^阅读档案/ }),
  ).toBeVisible();
  await expect(page.getByTitle("设置与备份", { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test("application menu supports keyboard focus and dismissal without navigating the PDF", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "体验示例教材" }).click();
  const trigger = page.getByRole("button", { name: "应用菜单" });
  const menu = page.getByRole("menu", { name: "应用操作" });
  const input = page
    .getByRole("region", { name: "主阅读区", exact: true })
    .getByRole("textbox", { name: "页码", exact: true });
  await expect(input).toHaveValue("1");
  await trigger.focus();
  await trigger.press("ArrowDown");
  await expect(menu.getByRole("menuitem", { name: /打开 PDF/ })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(
    menu.getByRole("menuitem", { name: "切换深色界面" }),
  ).toBeFocused();
  await page.keyboard.press("End");
  await expect(
    menu.getByRole("menuitem", { name: "设置与备份" }),
  ).toBeFocused();
  await page.keyboard.press("Home");
  await expect(menu.getByRole("menuitem", { name: /打开 PDF/ })).toBeFocused();
  await page.keyboard.press("Escape");
  // Reopen to verify horizontal keys are consumed by the menu as well.
  await trigger.press("ArrowDown");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowLeft");
  await expect(input).toHaveValue("1");
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await expect(menu).toHaveCount(0);
  await expect(input).toHaveValue("1");
  await trigger.press("ArrowUp");
  await expect(
    menu.getByRole("menuitem", { name: "设置与备份" }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(menu).toHaveCount(0);
  await trigger.click();
  await input.click();
  await expect(menu).toHaveCount(0);
  await expect(input).toBeFocused();
});
