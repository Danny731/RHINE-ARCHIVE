import { test, expect, type Page } from "@playwright/test";
import { resolve } from "node:path";
async function open(page: Page, name: string) {
  await page
    .getByLabel("选择 PDF 文件")
    .setInputFiles(resolve(`tests/fixtures/${name}.pdf`));
  await expect(
    page.locator(
      '.workspace-group.is-active [role="tab"][aria-selected="true"]',
    ),
  ).toHaveAttribute("aria-label", name);
  await expect(
    page.locator(".workspace-group.is-active canvas").first(),
  ).toBeVisible();
}
async function menu(page: Page, title: string, action: string) {
  await page
    .getByRole("button", { name: `标签菜单：${title}`, exact: true })
    .last()
    .click();
  await page.getByRole("menuitem", { name: action, exact: true }).click();
}
const library = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem("pagewise-library")!));

test("different PDF tabs preserve drafts, isolate annotations, and restore split sessions", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await open(page, "toc-headings");
  await page.getByRole("textbox", { name: "页码", exact: true }).fill("4");
  await page.getByRole("textbox", { name: "页码", exact: true }).press("Enter");
  await page.getByTitle("切换笔记面板").click();
  await page.getByRole("textbox", { name: "新笔记" }).fill("左书草稿");
  await open(page, "toc-printed");
  await expect(page.getByRole("tab")).toHaveCount(2);
  await page.getByTitle("切换笔记面板").click();
  await expect(page.getByRole("textbox", { name: "新笔记" })).toHaveValue("");
  await page.getByRole("textbox", { name: "新笔记" }).fill("右书笔记");
  await page.getByRole("button", { name: "添加笔记", exact: true }).click();
  await page.getByRole("tab", { name: "toc-headings", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "新笔记" })).toHaveValue(
    "左书草稿",
  );
  await expect(
    page.getByRole("textbox", { name: "页码", exact: true }),
  ).toHaveValue("4");
  await expect(page.locator(".note-card")).toHaveCount(0);
  await page
    .getByRole("button", { name: "关闭标签：toc-headings", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("笔记草稿");
  await expect(page.getByRole("tab")).toHaveCount(2);
  await page.getByRole("button", { name: "添加笔记", exact: true }).click();
  await menu(page, "toc-printed", "在右侧分屏");
  await expect(page.locator(".workspace-group")).toHaveCount(2);
  await expect(
    page.locator(".notes-panel .active-document-caption"),
  ).toContainText("toc-printed");
  const left = page.getByRole("region", { name: "主阅读区", exact: true }),
    right = page.getByRole("region", { name: "对照阅读区", exact: true });
  await right.getByRole("textbox", { name: "对照页码" }).fill("8");
  await right.getByRole("textbox", { name: "对照页码" }).press("Enter");
  await expect(
    left.getByRole("textbox", { name: "页码", exact: true }),
  ).toHaveValue("4");
  await page.getByRole("button", { name: "切换书签", exact: true }).click();
  await expect(page.getByText("阅读资料已保存")).toBeVisible();
  const lib = await library(page);
  expect(
    lib.books.find((b: any) => b.title === "toc-headings").marks[0],
  ).toMatchObject({ note: "左书草稿", page: 4 });
  expect(
    lib.books.find((b: any) => b.title === "toc-printed").marks[0].note,
  ).toBe("右书笔记");
  expect(
    lib.books.find((b: any) => b.title === "toc-printed").bookmarks[0].page,
  ).toBe(8);
  await page.reload();
  await expect(page.locator(".workspace-group")).toHaveCount(2);
  await expect(right.getByRole("textbox", { name: "对照页码" })).toHaveValue(
    "8",
  );
  await expect(
    left.getByRole("textbox", { name: "页码", exact: true }),
  ).toHaveValue("4");
  await menu(page, "toc-printed", "关闭标签");
  await expect(page.locator(".workspace-group")).toHaveCount(1);
  await expect(
    page.getByRole("tab", { name: "toc-headings", exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("pointer dragging reorders tabs, splits at bottom and merges groups when moved back", async ({
  page,
}) => {
  await page.goto("/");
  await open(page, "toc-headings");
  await open(page, "toc-printed");
  const from = await page
    .getByRole("tab", { name: "toc-printed", exact: true })
    .boundingBox();
  const first = await page
    .getByRole("tab", { name: "toc-headings", exact: true })
    .boundingBox();
  await page.mouse.move(from!.x + 40, from!.y + 15);
  await page.mouse.down();
  await page.mouse.move(first!.x + 3, first!.y + 15, { steps: 12 });
  await page.mouse.up();
  await expect(page.getByRole("tab").first()).toHaveText("toc-printed");
  const tab = await page
    .getByRole("tab", { name: "toc-printed", exact: true })
    .boundingBox();
  const body = await page.locator(".workspace-body").boundingBox();
  await page.mouse.move(tab!.x + 40, tab!.y + 15);
  await page.mouse.down();
  await page.mouse.move(
    body!.x + body!.width / 2,
    body!.y + body!.height - 30,
    { steps: 15 },
  );
  await expect(page.getByText("松开后在下方分屏")).toBeVisible();
  await page.mouse.up();
  await expect(page.locator(".tab-workspace")).toHaveClass(/split-vertical/);
  await expect(page.locator(".workspace-group")).toHaveCount(2);
  const sep = page.getByRole("separator", { name: "调整分屏比例" });
  await sep.focus();
  await page.keyboard.press("ArrowUp");
  await expect(sep).toHaveAttribute("aria-valuenow", "45");
  const lower = await page
    .getByRole("tab", { name: "toc-printed", exact: true })
    .boundingBox();
  const upper = await page
    .getByRole("tab", { name: "toc-headings", exact: true })
    .boundingBox();
  await page.mouse.move(lower!.x + 35, lower!.y + 15);
  await page.mouse.down();
  await page.mouse.move(upper!.x + 2, upper!.y + 15, { steps: 15 });
  await page.mouse.up();
  await expect(page.locator(".workspace-group")).toHaveCount(1);
  await expect(page.getByRole("tab")).toHaveCount(2);
  await menu(page, "toc-headings", "在另一侧对照同一 PDF");
  await expect(page.locator(".workspace-group")).toHaveCount(2);
  await expect(
    page.getByRole("tab", { name: "toc-headings", exact: true }),
  ).toHaveCount(2);
});

test("closing tabs keeps shelf data and a missing restored PDF does not block the other pane", async ({
  page,
}) => {
  await page.goto("/");
  await open(page, "toc-headings");
  await open(page, "toc-printed");
  await menu(page, "toc-printed", "在右侧分屏");
  await expect(page.getByText("阅读资料已保存")).toBeVisible();
  await page.evaluate(async () => {
    const lib = JSON.parse(localStorage.getItem("pagewise-library")!);
    const id = lib.books.find((b: any) => b.title === "toc-printed").id;
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open("pagewise-files", 1);
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction("files", "readwrite");
        tx.objectStore("files").delete(id);
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = reject;
      };
    });
  });
  await page.reload();
  await expect(
    page.getByRole("button", { name: "重新定位 PDF", exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("region", { name: "主阅读区", exact: true })
      .locator("canvas")
      .first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "关闭此标签" }).click();
  await page
    .getByRole("button", { name: "关闭标签：toc-headings", exact: true })
    .click();
  await expect(page.locator(".book-card")).toHaveCount(2);
});

test("background drafts and history survive reload, repeated switching releases workers, and broken opens keep the current book", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await open(page, "toc-headings");
  await page.getByRole("textbox", { name: "页码", exact: true }).fill("3");
  await page.getByRole("textbox", { name: "页码", exact: true }).press("Enter");
  await page.getByTitle("切换笔记面板").click();
  await page.getByRole("textbox", { name: "新笔记" }).fill("第三页的草稿");
  await page.getByRole("textbox", { name: "页码", exact: true }).fill("4");
  await page.getByRole("textbox", { name: "页码", exact: true }).press("Enter");
  await open(page, "toc-printed");
  await expect(page.getByText("阅读资料已保存")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("tab")).toHaveCount(2);
  for (let i = 0; i < 6; i++) {
    const name = i % 2 ? "toc-printed" : "toc-headings";
    await page.getByRole("tab", { name, exact: true }).click();
    await expect(
      page.locator(".workspace-group.is-active canvas").first(),
    ).toBeVisible();
  }
  await expect.poll(() => page.workers().length).toBeLessThanOrEqual(1);
  await page.getByRole("tab", { name: "toc-headings", exact: true }).click();
  await page.getByTitle("切换笔记面板").click();
  await expect(page.getByRole("textbox", { name: "新笔记" })).toHaveValue(
    "第三页的草稿",
  );
  await page.getByRole("button", { name: "添加笔记", exact: true }).click();
  await expect(page.getByText("阅读资料已保存")).toBeVisible();
  expect(
    (await library(page)).books.find((b: any) => b.title === "toc-headings")
      .marks[0],
  ).toMatchObject({ note: "第三页的草稿", page: 3 });
  await page.keyboard.press("Alt+ArrowLeft");
  await expect(
    page.getByRole("textbox", { name: "页码", exact: true }),
  ).toHaveValue("3");
  await page.getByLabel("选择 PDF 文件").setInputFiles({
    name: "broken.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("broken"),
  });
  await expect(page.getByRole("status")).toContainText("打开失败");
  await expect(
    page.locator(
      '.workspace-group.is-active [role="tab"][aria-selected="true"]',
    ),
  ).toHaveAttribute("aria-label", "toc-headings");
  await expect(page.getByRole("tab")).toHaveCount(2);
  expect(errors).toEqual([]);
});

test("separate same-PDF views retain their page positions and active keyboard/notes targets", async ({
  page,
}) => {
  await page.goto("/");
  await open(page, "toc-headings");
  await page.getByRole("button", { name: "分屏对照", exact: true }).click();
  const left = page.getByRole("region", { name: "主阅读区", exact: true }),
    right = page.getByRole("region", { name: "对照阅读区", exact: true });
  await right.getByRole("textbox", { name: "对照页码" }).fill("4");
  await right.getByRole("textbox", { name: "对照页码" }).press("Enter");
  await right.locator(".reader-scroll").click({ position: { x: 30, y: 30 } });
  await page.keyboard.press("ArrowRight");
  await expect(right.getByRole("textbox", { name: "对照页码" })).toHaveValue(
    "5",
  );
  await expect(
    left.getByRole("textbox", { name: "页码", exact: true }),
  ).toHaveValue("1");
  await page.getByTitle("切换笔记面板").click();
  await page.getByRole("textbox", { name: "新笔记" }).fill("右侧第五页");
  await page.getByRole("button", { name: "添加笔记", exact: true }).click();
  await expect(page.getByText("阅读资料已保存")).toBeVisible();
  expect((await library(page)).books[0].marks[0]).toMatchObject({
    page: 5,
    note: "右侧第五页",
  });
  await page.getByRole("button", { name: "分屏对照", exact: true }).click();
  await expect(page.locator(".workspace-group")).toHaveCount(1);
  await expect(page.getByRole("tab")).toHaveCount(2);
  await page.getByRole("button", { name: "分屏对照", exact: true }).click();
  await expect(page.getByRole("tab")).toHaveCount(2);
  await expect(page.getByText("阅读资料已保存")).toBeVisible();
  await page.reload();
  await expect
    .poll(() =>
      page
        .locator(".workspace-body .page-control input")
        .evaluateAll((inputs) =>
          inputs.map((i) => (i as HTMLInputElement).value).sort(),
        ),
    )
    .toEqual(["1", "5"]);
});
