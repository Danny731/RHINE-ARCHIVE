import { test, expect } from "@playwright/test";
import { resolve } from "node:path";

test("v0.1 shelf survives upgrade, missing file can be safely relinked without losing notes", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByLabel("选择 PDF 文件")
    .setInputFiles(resolve("tests/fixtures/toc-headings.pdf"));
  const main = page.getByRole("region", { name: "主阅读区" });
  await expect(main).toBeVisible();
  await expect(page.getByText("阅读资料已保存")).toBeVisible();
  const legacy = await page.evaluate(async () => {
    const lib = JSON.parse(localStorage.getItem("pagewise-library")!);
    const book = lib.books[0];
    delete book.documentSignature;
    book.path = "D:/old-computer/教材.pdf";
    book.position.page = 4;
    book.bookmarks = [{ id: "legacy-bookmark", page: 4, title: "旧书签" }];
    book.marks = [
      {
        id: "legacy-note",
        page: 4,
        kind: "note",
        quote: "",
        note: "升级前的笔记",
        rects: [],
        created: 1,
      },
    ];
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open("pagewise-files", 1);
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction("files", "readwrite");
        tx.objectStore("files").clear();
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = reject;
      };
    });
    return lib;
  });
  // Seed on the next load, after the current app's pagehide save has finished.
  await page.addInitScript((lib) => {
    if (!sessionStorage.getItem("legacy-fixture-loaded")) {
      localStorage.setItem("pagewise-library", JSON.stringify(lib));
      sessionStorage.setItem("legacy-fixture-loaded", "true");
    }
  }, legacy);
  await page.reload();
  await expect(page.locator(".book-card")).toHaveCount(1);
  await page.locator(".book-card").click();
  await expect(
    page.getByRole("dialog", { name: "重新定位 PDF" }),
  ).toBeVisible();
  const select = async (path: string) => {
    const chooser = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "选择原 PDF 的新位置" }).click();
    await (await chooser).setFiles(resolve(path));
  };
  await select("tests/fixtures/toc-no-text.pdf");
  await expect(page.getByText(/所选 PDF 与原书架记录不一致/)).toBeVisible();
  await expect(page.locator(".book-card")).toHaveCount(1);
  await select("tests/fixtures/toc-headings.pdf");
  await expect(page.getByRole("dialog", { name: "重新定位 PDF" })).toHaveCount(
    0,
  );
  await expect(
    main.getByRole("textbox", { name: "页码", exact: true }),
  ).toHaveValue("4");
  await page.getByTitle("切换笔记面板").click();
  await expect(page.locator(".note-card textarea")).toHaveValue("升级前的笔记");
  await expect(page.getByText("阅读资料已保存")).toBeVisible();
  await page.reload();
  await page.locator(".book-card").click();
  await expect(
    main.getByRole("textbox", { name: "页码", exact: true }),
  ).toHaveValue("4");
});
