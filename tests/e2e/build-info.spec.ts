import { test, expect } from "@playwright/test";

test("settings expose a readable build identifier and copy only application metadata", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          (window as any).copiedBuild = text;
        },
      },
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "设置与备份", exact: true }).click();
  const number = page.getByTestId("build-number");
  await expect(number).toHaveText(
    /^\d{8}T\d{6}Z-(?:[a-f0-9]{8}|unknown)(?:-local)?$/,
  );
  await page.getByRole("button", { name: "复制构建信息", exact: true }).click();
  await expect(page.getByText("构建信息已复制", { exact: true })).toBeVisible();
  const text = await page.evaluate(() => (window as any).copiedBuild as string);
  expect(text).toContain((await number.textContent())!);
  expect(text).toContain("RHINE ARCHIVE");
  expect(text).not.toMatch(/C:\\|\/Users\/|\.pdf|bookmarks|inkStrokes/);
  await page.setViewportSize({ width: 900, height: 620 });
  await expect(number).toBeVisible();
  expect(
    await page
      .locator(".build-details")
      .evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
  ).toBe(true);
});
