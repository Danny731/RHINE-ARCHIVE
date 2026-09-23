import { test, expect, type Locator } from "@playwright/test";

const sheetWidth = (pane: Locator, number = 1) =>
  pane
    .locator(`[data-page="${number}"] .pdf-page`)
    .evaluate((el) => el.getBoundingClientRect().width);

test("zoom keys use the displayed scale, preserve reading position, and persist within limits", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.getByRole("button", { name: "体验示例教材" }).click();
  const main = page.getByRole("region", { name: "主阅读区", exact: true });
  await expect(main.locator(".textLayer").first()).toContainText(
    "Linear algebra begins",
  );
  const uiWidth = await main
    .locator(".pane-toolbar")
    .evaluate((el) => el.getBoundingClientRect().width);
  const initialWidth = await sheetWidth(main);
  await page.keyboard.press("Control+=");
  await expect.poll(() => sheetWidth(main)).toBeGreaterThan(initialWidth);
  const enlargedWidth = await sheetWidth(main);
  await page.keyboard.press("Control+-");
  await expect.poll(() => sheetWidth(main)).toBeLessThan(enlargedWidth);
  expect(Math.abs((await sheetWidth(main)) - initialWidth)).toBeLessThan(4);
  await page.keyboard.press("Control+Shift+=");
  await expect.poll(() => sheetWidth(main)).toBeGreaterThan(initialWidth);
  await page.keyboard.press("Control+NumpadSubtract");
  await page.keyboard.press("Control+NumpadAdd");
  await expect.poll(() => sheetWidth(main)).toBeGreaterThan(initialWidth);

  await page.locator(".outline-item").filter({ hasText: "Exercises" }).click();
  await expect(
    main.getByRole("textbox", { name: "页码", exact: true }),
  ).toHaveValue("7");
  const scroll = main.locator(".reader-scroll");
  await scroll.evaluate((el) => {
    el.scrollTop += 180;
  });
  const offset = () =>
    scroll.evaluate((el) => {
      const wrap = el.querySelector<HTMLElement>('[data-page="7"]')!;
      return (
        (el.scrollTop - wrap.offsetTop + 24) /
        wrap.querySelector<HTMLElement>(".pdf-page")!.offsetHeight
      );
    });
  const before = await offset();
  await page.keyboard.press("Control+=");
  await expect
    .poll(async () => Math.abs((await offset()) - before))
    .toBeLessThan(0.01);
  await expect(
    main.getByRole("textbox", { name: "页码", exact: true }),
  ).toHaveValue("7");
  expect(
    await main
      .locator(".pane-toolbar")
      .evaluate((el) => el.getBoundingClientRect().width),
  ).toBe(uiWidth);

  // Unmodified +/- remain ordinary text entry, including in the page field.
  const input = main.getByRole("textbox", { name: "页码", exact: true });
  const zoomBeforeTyping = await main.locator(".zoom-button").innerText();
  await input.fill("+-");
  await expect(input).toHaveValue("+-");
  await expect(main.locator(".zoom-button")).toHaveText(zoomBeforeTyping);
  await input.fill("7");
  for (let i = 0; i < 35; i++) await page.keyboard.press("Control+-");
  await expect(main.locator(".zoom-button")).toHaveText("25%");
  for (let i = 0; i < 35; i++) await page.keyboard.press("Control+=");
  await expect(main.locator(".zoom-button")).toHaveText("300%");
  await expect(page.getByText("阅读资料已保存")).toBeVisible();
  await page.reload();
  await expect(main.locator(".zoom-button")).toHaveText("300%");
  expect(errors).toEqual([]);
});

test("Ctrl wheel targets the hovered pane, normal wheel scrolls, and keys follow the selected pane", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "体验示例教材" }).click();
  const main = page.getByRole("region", { name: "主阅读区", exact: true });
  await expect(main.locator(".textLayer").first()).toContainText(
    "Linear algebra begins",
  );
  await page.getByRole("button", { name: "分屏对照", exact: true }).click();
  const secondary = page.getByRole("region", {
    name: "对照阅读区",
    exact: true,
  });
  await expect(secondary.locator("canvas")).toBeVisible();
  // Split layout settles after the reader's resize debounce. Measure the
  // baseline only once both panes fit their actual scroll containers.
  for (const [pane, number] of [
    [main, 1],
    [secondary, 2],
  ] as const) {
    await expect
      .poll(async () =>
        Math.abs(
          (await sheetWidth(pane, number)) -
            (await pane
              .locator(".reader-scroll")
              .evaluate((element) => element.clientWidth - 48)),
        ),
      )
      .toBeLessThan(2);
  }
  const mainWidth = await sheetWidth(main);
  const secondaryWidth = await sheetWidth(secondary, 2);
  const deviceScale = await page.evaluate(() => window.devicePixelRatio);
  await secondary
    .locator(".reader-scroll")
    .hover({ position: { x: 140, y: 140 } });
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, -120);
  await page.keyboard.up("Control");
  await expect
    .poll(() => sheetWidth(secondary, 2))
    .toBeGreaterThan(secondaryWidth);
  expect(await sheetWidth(main)).toBe(mainWidth);
  const wheelWidth = await sheetWidth(secondary, 2);
  await page.keyboard.press("Control+=");
  await expect.poll(() => sheetWidth(secondary, 2)).toBeGreaterThan(wheelWidth);
  expect(await sheetWidth(main)).toBe(mainWidth);
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, 120);
  await page.keyboard.up("Control");
  await expect
    .poll(async () => Math.abs((await sheetWidth(secondary, 2)) - wheelWidth))
    .toBeLessThan(1);
  expect(await page.evaluate(() => window.devicePixelRatio)).toBe(deviceScale);

  await main.locator(".reader-scroll").click({ position: { x: 140, y: 140 } });
  await page.keyboard.press("Control+=");
  await expect.poll(() => sheetWidth(main)).toBeGreaterThan(mainWidth);
  expect(await sheetWidth(secondary, 2)).toBeCloseTo(wheelWidth, 0);
  const mainZoom = await main.locator(".zoom-button").innerText();
  const topBefore = await main
    .locator(".reader-scroll")
    .evaluate((el) => el.scrollTop);
  await page.mouse.wheel(0, 250);
  await expect
    .poll(() => main.locator(".reader-scroll").evaluate((el) => el.scrollTop))
    .toBeGreaterThan(topBefore);
  await expect(main.locator(".zoom-button")).toHaveText(mainZoom);

  await secondary
    .locator(".reader-scroll")
    .click({ position: { x: 140, y: 140 } });
  await page.getByRole("button", { name: "分屏对照", exact: true }).click();
  const beforeClose = await main.locator(".zoom-button").innerText();
  await page.keyboard.press("Control+=");
  await expect(main.locator(".zoom-button")).not.toHaveText(beforeClose);
});
