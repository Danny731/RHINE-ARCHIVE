import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  // Also exercise Mac behavior when WebKit tests run on the Windows dev machine.
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "platform", { get: () => "MacIntel" }),
  );
});

test("Mac Command shortcuts, trackpad gestures, handwriting and manual update UI", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.getByRole("button", { name: "体验示例教材" }).click();
  const main = page.getByRole("region", { name: "主阅读区", exact: true });
  const layer = main.locator('[data-page="1"] .ink-layer');
  await expect(layer).toBeVisible();
  const initial = (await layer.boundingBox())!.width;
  await page.keyboard.press("Meta+=");
  await expect
    .poll(async () => (await layer.boundingBox())?.width || 0)
    .toBeGreaterThan(initial);
  await page.keyboard.press("Meta+-");
  await expect(layer).toBeVisible();
  // WebKit-specific gesturechange events must survive rerenders during the pinch.
  const scroller = main.locator(".reader-scroll");
  await expect(scroller).toHaveCount(1);
  const gesture = async (type: string, scale: number) =>
    scroller.evaluate(
      (el, data) => {
        const event = new Event(data.type, { bubbles: true, cancelable: true });
        Object.defineProperty(event, "scale", { value: data.scale });
        el.dispatchEvent(event);
      },
      { type, scale },
    );
  const beforePinch = (await layer.boundingBox())!.width;
  await gesture("gesturestart", 1);
  await gesture("gesturechange", 1.1);
  await expect
    .poll(async () => (await layer.boundingBox())?.width || 0)
    .toBeGreaterThan(beforePinch);
  await gesture("gesturechange", 1.2);
  await gesture("gestureend", 1.2);
  await page.keyboard.press("Meta+b");
  await page.getByRole("button", { name: "书签", exact: true }).click();
  await expect(page.locator(".bookmark-row")).toHaveCount(1);
  await page.keyboard.press("Meta+f");
  await expect(page.locator("#pdf-search")).toBeFocused();
  await page.locator("#pdf-search").press("Tab");
  await page.getByRole("button", { name: "绘制", exact: true }).click();
  const rect = (await layer.boundingBox())!;
  await page.mouse.move(rect.x + 50, rect.y + 50);
  await page.mouse.down();
  await page.mouse.move(rect.x + 130, rect.y + 70, { steps: 10 });
  await page.mouse.up();
  await expect(layer.locator("[data-ink-id]")).toHaveCount(1);
  await page.keyboard.press("Meta+z");
  await expect(layer.locator("[data-ink-id]")).toHaveCount(0);
  await page.keyboard.press("Meta+Shift+z");
  await expect(layer.locator("[data-ink-id]")).toHaveCount(1);
  await page.getByRole("button", { name: "设置与备份", exact: true }).click();
  await expect(
    page.getByText("Mac 测试版暂不支持应用内升级。", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "检查更新", exact: true }),
  ).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.keyboard.press("Meta+w");
  await expect(page.getByRole("tab")).toHaveCount(0);
  expect(errors).toEqual([]);
});
