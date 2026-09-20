import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteStaticCopy } from "vite-plugin-static-copy";

export default defineConfig({
  plugins: [
    react(),
    viteStaticCopy({
      targets: [
        { src: "node_modules/pdfjs-dist/cmaps", dest: "pdf-assets" },
        { src: "node_modules/pdfjs-dist/standard_fonts", dest: "pdf-assets" },
        { src: "node_modules/pdfjs-dist/wasm", dest: "pdf-assets" },
      ],
    }),
  ],
  base: "./",
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
});
