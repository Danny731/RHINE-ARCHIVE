import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  testIgnore: ["macos.spec.ts", "native-close.spec.ts"],
  timeout: 60000,
  use: {
    baseURL: "http://127.0.0.1:1420",
    viewport: { width: 1360, height: 900 },
    headless: true,
    channel: "msedge",
    screenshot: "only-on-failure",
  },
  reporter: "list",
});
