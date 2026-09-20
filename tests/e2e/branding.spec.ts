import { test, expect } from "@playwright/test";
import { resolve } from "node:path";

for (const signed of [true, false]) {
  test(`new demo uses RHINE ARCHIVE and the legacy ${signed ? "signed" : "fingerprint-only"} demo retains notes/position`, async ({
    page,
  }) => {
    await page.goto("/");
    await page
      .getByLabel("选择 PDF 文件")
      .setInputFiles(resolve("public/legacy/sample-v1.pdf"));
    await expect(page.locator(".textLayer").first()).toContainText("PAGEWISE");
    await page.getByRole("textbox", { name: "页码", exact: true }).fill("4");
    await page
      .getByRole("textbox", { name: "页码", exact: true })
      .press("Enter");
    await page.getByRole("button", { name: "切换书签", exact: true }).click();
    await page.getByTitle("切换笔记面板").click();
    await page
      .getByRole("textbox", { name: "新笔记" })
      .fill("示例更名之前的笔记");
    await page.getByRole("button", { name: "添加笔记", exact: true }).click();
    await expect(page.getByText("阅读资料已保存")).toBeVisible();
    const legacy = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("pagewise-library")!),
    );
    legacy.books[0].source = "demo";
    if (!signed) delete legacy.books[0].documentSignature;
    const oldId = legacy.books[0].id;
    await page.addInitScript((lib) => {
      if (!sessionStorage.getItem("brand-legacy-seeded")) {
        localStorage.setItem("pagewise-library", JSON.stringify(lib));
        sessionStorage.setItem("brand-legacy-seeded", "1");
      }
    }, legacy);
    await page.reload();
    await expect(
      page.getByRole("textbox", { name: "页码", exact: true }),
    ).toHaveValue("4");
    await expect(page.locator('[data-page="4"] .textLayer')).toContainText(
      "Matrices as transformations",
    );
    await page.getByTitle("切换笔记面板").click();
    await expect(page.locator(".note-card textarea")).toHaveValue(
      "示例更名之前的笔记",
    );
    await page.getByRole("button", { name: "返回书架", exact: true }).click();
    await page
      .getByRole("button", { name: "体验示例教材", exact: true })
      .click();
    await expect(
      page.locator('.workspace-group.is-active [data-page="1"] .textLayer'),
    ).toContainText("RHINE ARCHIVE");
    await expect(
      page.locator('.workspace-group.is-active [data-page="1"] .textLayer'),
    ).not.toContainText("PAGEWISE");
    await expect(page.getByText("阅读资料已保存")).toBeVisible();
    const books = await page.evaluate(
      () => JSON.parse(localStorage.getItem("pagewise-library")!).books,
    );
    expect(books).toHaveLength(2);
    expect(books.find((b: any) => b.id === oldId).marks).toEqual(
      legacy.books[0].marks,
    );
    expect(books.find((b: any) => b.id === oldId).bookmarks).toEqual(
      legacy.books[0].bookmarks,
    );
  });
}
