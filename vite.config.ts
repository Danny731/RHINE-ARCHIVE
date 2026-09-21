import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteStaticCopy } from "vite-plugin-static-copy";
import { currentBuildInfo } from "./scripts/build-info.ts";
import packageInfo from "./package.json" with { type: "json" };

export default defineConfig(({ command }) => {
  const buildInfo = currentBuildInfo(packageInfo.version, command === "serve");
  return {
    define: { __RHINE_BUILD_INFO__: JSON.stringify(buildInfo) },
    plugins: [
      react(),
      {
        name: "rhine-build-info",
        generateBundle() {
          this.emitFile({
            type: "asset",
            fileName: "build-info.json",
            source: JSON.stringify(buildInfo, null, 2) + "\n",
          });
        },
      },
      viteStaticCopy({
        targets: [
          { src: "node_modules/pdfjs-dist/cmaps", dest: "pdf-assets" },
          { src: "node_modules/pdfjs-dist/standard_fonts", dest: "pdf-assets" },
          { src: "node_modules/pdfjs-dist/wasm", dest: "pdf-assets" },
        ],
      }),
    ],
    base: "./",
    // Include PDF.js' feature polyfills in both the UI and worker for WKWebView.
    resolve: {
      alias: [
        {
          find: /^pdfjs-dist$/,
          replacement: "pdfjs-dist/legacy/build/pdf.mjs",
        },
      ],
    },
    // A first handwriting export must not trigger dependency discovery + a page reload.
    optimizeDeps: { include: ["pdf-lib"] },
    server: {
      port: 1420,
      strictPort: true,
      watch: {
        // Tauri watches Rust sources; Vite must not watch compiler output or local tools.
        ignored: ["**/src-tauri/**", "**/.tools/**"],
      },
    },
    build: { target: "es2022" },
  };
});
