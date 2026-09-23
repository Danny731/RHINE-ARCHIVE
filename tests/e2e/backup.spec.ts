import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

const savedBookmarks = (page: Page) =>
  page.evaluate(
    () =>
      JSON.parse(localStorage.getItem("pagewise-library") || "{}").books?.[0]
        ?.bookmarks.length,
  );

test("recovery revalidates a cached PDF instead of replacing the restored content signature", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "体验示例教材" }).click();
  await expect.poll(() => savedBookmarks(page)).toBe(0);
  const incoming = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("pagewise-library")!),
  );
  incoming.books[0].documentSignature = `sha256:${"0".repeat(64)}`;
  await page.getByLabel("选择备份文件").setInputFiles({
    name: "other-revision.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(incoming)),
  });
  await page.getByRole("button", { name: "回退到此备份", exact: true }).click();
  await expect(page.getByRole("region", { name: "备份恢复预览" })).toHaveCount(
    0,
  );
  await page.getByTitle("关闭设置").click();
  await expect(page.getByText(/所选 PDF 与原书架记录不一致/)).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("pagewise-library")!).books[0]
          .documentSignature,
    ),
  ).toBe(incoming.books[0].documentSignature);
});

test("damaged stored library exports original bytes and recovery protects them before replacement", async ({
  page,
}) => {
  const original = '{"unreadable":"private original';
  await page.addInitScript((original) => {
    if (sessionStorage.getItem("seeded")) return;
    sessionStorage.setItem("seeded", "1");
    localStorage.setItem("pagewise-library", original);
    const raw = JSON.stringify({ version: 1, books: [], dark: false });
    localStorage.setItem(
      "rhine-library-backups-v1",
      JSON.stringify([
        {
          id: "good",
          createdAt: Date.now(),
          reason: "manual",
          size: raw.length,
          raw,
        },
      ]),
    );
  }, original);
  await page.goto("/");
  await expect(page.getByText("书库读取失败", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "管理备份", exact: true }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出备份", exact: true }).click();
  expect(await readFile((await (await download).path())!, "utf8")).toBe(
    original,
  );
  await page.getByRole("button", { name: "预览恢复", exact: true }).click();
  expect(
    await page.evaluate(() => localStorage.getItem("pagewise-library")),
  ).toBe(original);
  await page.getByRole("button", { name: "回退到此备份", exact: true }).click();
  await expect(page.getByRole("region", { name: "备份恢复预览" })).toHaveCount(
    0,
  );
  const backups = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("rhine-library-backups-v1")!),
  );
  expect(
    backups.find((entry: any) => entry.reason === "before-restore").raw,
  ).toBe(original);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "阅读档案 ARCHIVE INDEX" }),
  ).toBeVisible();
  await expect(page.getByLabel("操作错误")).toHaveCount(0);
});

test("manual backup rollback preserves the pre-restore shelf and remains restored after reload", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.getByRole("button", { name: "体验示例教材" }).click();
  await expect(page.getByRole("region", { name: "主阅读区" })).toBeVisible();
  await page.getByRole("button", { name: "切换书签", exact: true }).click();
  await expect.poll(() => savedBookmarks(page)).toBe(1);
  await page.getByRole("button", { name: "应用菜单", exact: true }).click();
  await page.getByTitle("设置与备份").click();
  await page.getByRole("button", { name: "立即备份", exact: true }).click();
  await expect(page.getByText("已创建本地备份", { exact: true })).toBeVisible();
  await page.getByTitle("关闭设置").click();
  await page.getByRole("button", { name: "切换书签", exact: true }).click();
  await expect.poll(() => savedBookmarks(page)).toBe(0);
  await page.getByRole("button", { name: "应用菜单", exact: true }).click();
  await page.getByTitle("设置与备份").click();
  await page
    .locator(".backup-list li")
    .filter({ has: page.getByText("手动备份", { exact: true }) })
    .getByRole("button", { name: "预览恢复" })
    .click();
  await page.getByRole("button", { name: "回退到此备份", exact: true }).click();
  await expect(page.getByRole("region", { name: "备份恢复预览" })).toHaveCount(
    0,
  );
  await expect.poll(() => savedBookmarks(page)).toBe(1);
  const protectedRaw = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem("rhine-library-backups-v1")!).find(
        (entry: any) => entry.reason === "before-restore",
      ).raw,
  );
  expect(JSON.parse(protectedRaw).books[0].bookmarks).toHaveLength(0);
  await page.getByTitle("关闭设置").click();
  await page.reload();
  await expect.poll(() => savedBookmarks(page)).toBe(1);
  expect(errors).toEqual([]);
});

test("save failures remain visible, allow exporting unsaved changes and retry without leaking diagnostics", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if ((window as any).failWrites && key === "pagewise-library")
        throw new DOMException(
          "C:/Users/Private/secret.pdf private-note",
          "QuotaExceededError",
        );
      return original.call(this, key, value);
    };
  });
  await page.goto("/");
  await page.getByRole("button", { name: "体验示例教材" }).click();
  await expect.poll(() => savedBookmarks(page)).toBe(0);
  await page.evaluate(() => {
    (window as any).failWrites = true;
  });
  await page.getByRole("button", { name: "切换书签", exact: true }).click();
  await expect(
    page.getByText("阅读资料保存失败", { exact: true }),
  ).toBeVisible();
  await page.getByText("查看错误详情", { exact: true }).click();
  expect(
    await page.getByLabel("诊断摘要", { exact: true }).inputValue(),
  ).not.toMatch(/Private|secret.pdf|private-note/);
  expect(await savedBookmarks(page)).toBe(0);
  await page.getByRole("button", { name: "管理备份", exact: true }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出备份", exact: true }).click();
  const exported = JSON.parse(
    await readFile((await (await download).path())!, "utf8"),
  );
  expect(exported.books[0].bookmarks).toHaveLength(1);
  await page.evaluate(() => {
    (window as any).failWrites = false;
  });
  await page.getByRole("button", { name: "重试保存", exact: true }).click();
  await expect.poll(() => savedBookmarks(page)).toBe(1);
  await expect(page.getByLabel("操作错误")).toHaveCount(0);
});
