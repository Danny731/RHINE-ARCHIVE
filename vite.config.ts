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
  server: { port: 1420, strictPort: true },
  build: { target: "es2022" },
});
