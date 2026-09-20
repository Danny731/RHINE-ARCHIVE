import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("Mac close waits for save and native fullscreen completion, and repeated close is ignored", async ({
  page,
}) => {
  const bytes = [...(await readFile("tests/fixtures/toc-headings.pdf"))];
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "platform", { get: () => "MacIntel" });
    Object.assign(globalThis, { isTauri: true });
  });
  await page.route("**/src/main.tsx*", async (route) => {
    const response = await route.fetch();
    const original = await response.text();
    const main = original.replace(/import App from [^;]+;/, "");
    if (main === original)
      throw new Error("Test bootstrap could not locate App import");
    const bootstrap = `
      import { mockIPC, mockWindows } from "/node_modules/@tauri-apps/api/mocks.js";
      window.bridge = { calls: [], saved: null, pending: true, nativeDone: null };
      mockWindows("main");
      mockIPC(async (cmd, args) => {
        const b = window.bridge;
        if(cmd === "load_library") return null;
        if(cmd === "take_pending_pdf") { if(!b.pending) return null; b.pending = false; return "/Users/Test/fixture.pdf"; }
        if(cmd === "read_pdf") return new Uint8Array(${JSON.stringify(bytes)}).buffer;
        if(cmd === "save_library") { await new Promise(r=>setTimeout(r,40)); b.saved = JSON.parse(args.json); b.calls.push("saved"); return; }
        if(cmd === "hide_reader_window") {
          b.calls.push("native-close-request");
          return new Promise(resolve => { b.nativeDone = () => { b.calls.push("native-fullscreen-exited"); b.calls.push("hidden"); resolve(); }; });
        }
        b.calls.push(cmd);
        return null;
      }, {shouldMockEvents: true});
      const {default: App} = await import("/src/App.tsx");
    `;
    await route.fulfill({
      response,
      body: bootstrap + main,
      contentType: "text/javascript",
    });
  });
  await page.goto("/");
  await expect(page.getByRole("tab")).toHaveCount(1);
  await page.getByTitle("切换笔记面板").click();
  await page
    .getByRole("textbox", { name: "新笔记" })
    .fill("全屏关闭之前的草稿");
  const emit = (action: string) =>
    page.evaluate(
      (action) =>
        (window as any).__TAURI_INTERNALS__.invoke("plugin:event|emit", {
          event: "native-action",
          payload: action,
        }),
      action,
    );
  await emit("close-window");
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as any).bridge.calls.includes("native-close-request"),
      ),
    )
    .toBe(true);
  await emit("close-window");
  const before = await page.evaluate(
    () => (window as any).bridge.calls as string[],
  );
  expect(before.filter((c) => c === "native-close-request")).toHaveLength(1);
  expect(before[before.indexOf("native-close-request") - 1]).toBe("saved");
  expect(before).not.toContain("hidden");
  expect(before).not.toContain("plugin:window|hide");
  await page.evaluate(() => (window as any).bridge.nativeDone());
  await expect
    .poll(() =>
      page.evaluate(() => (window as any).bridge.calls.includes("hidden")),
    )
    .toBe(true);
  await emit("quit");
  await expect
    .poll(() =>
      page.evaluate(() => (window as any).bridge.calls.includes("finish_quit")),
    )
    .toBe(true);
  const result = await page.evaluate(() => (window as any).bridge);
  expect(result.calls[result.calls.indexOf("finish_quit") - 1]).toBe("saved");
  expect(result.saved.workspace.tabs[0].draft.text).toBe("全屏关闭之前的草稿");
  expect(errors).toEqual([]);
});
