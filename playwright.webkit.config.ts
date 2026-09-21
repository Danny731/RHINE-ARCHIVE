import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: [
    "macos.spec.ts",
    "native-close.spec.ts",
    "build-info.spec.ts",
    "theme.spec.ts",
    "ink.spec.ts",
    "reader.spec.ts",
    "compatibility.spec.ts",
    "workspace.spec.ts",
    "toc.spec.ts",
    "pdf-text-compat.spec.ts",
  ],
  timeout: 90000,
  workers: 2,
  use: {
    baseURL: "http://127.0.0.1:1420",
    browserName: "webkit",
    viewport: { width: 1360, height: 900 },
    headless: true,
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npm run dev",
    url: "http://127.0.0.1:1420",
    reuseExistingServer: !process.env.CI,
  },
  reporter: "list",
});
