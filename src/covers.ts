import type { PDFDocumentProxy, PDFDocumentLoadingTask } from "pdfjs-dist";
import type { Book } from "./model";
import { cachedCover, cacheCover, coverKey } from "./cover-cache";
import { RenderScheduler, renderScheduler } from "./render-scheduler";
import { cachedFile, desktop, readPdf } from "./storage";
import { readDemo } from "./demo";
import { loadPdf } from "./pdf";
import { documentSignature } from "./toc/generate";
import { identifyBook } from "./book-identity";

// Background shelf extraction never opens more than one PDF at a time.
const extraction = new RenderScheduler(1);
function check(signal: AbortSignal) {
  if (signal.aborted) throw new DOMException("Cover cancelled", "AbortError");
}
export async function renderCover(
  book: Book,
  pdf: PDFDocumentProxy,
  signal: AbortSignal,
): Promise<Blob> {
  const key = coverKey(book);
  const blob = await renderScheduler.run(
    async () => {
      check(signal);
      const page = await pdf.getPage(book.coverPage || 1);
      check(signal);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({
        scale: Math.min(1, 480 / Math.max(base.width, base.height)),
      });
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.ceil(viewport.width));
      canvas.height = Math.max(1, Math.ceil(viewport.height));
      const task = page.render({
        canvas,
        viewport,
        background: "rgb(255,255,255)",
      });
      const cancel = () => task.cancel();
      signal.addEventListener("abort", cancel, { once: true });
      try {
        await task.promise;
        check(signal);
        return await new Promise<Blob>((resolve, reject) =>
          canvas.toBlob(
            (blob) =>
              blob ? resolve(blob) : reject(new Error("无法生成封面")),
            "image/png",
          ),
        );
      } finally {
        signal.removeEventListener("abort", cancel);
        canvas.width = canvas.height = 0;
        // A live document can be rendering in another pane: never clean up its page here.
      }
    },
    signal,
    3,
  );
  check(signal);
  await cacheCover(key, blob).catch(() => {}); // Cache is expendable; reading must still work.
  return blob;
}
export async function getCover(book: Book, signal: AbortSignal): Promise<Blob> {
  const cached = await cachedCover(coverKey(book)).catch(() => undefined);
  check(signal);
  if (cached) return cached;
  return extraction.run(
    async () => {
      check(signal);
      const existing = await cachedCover(coverKey(book)).catch(() => undefined);
      check(signal);
      if (existing) return existing;
      let task: PDFDocumentLoadingTask | undefined;
      const cancel = () => {
        void task?.destroy().catch(() => {});
      };
      signal.addEventListener("abort", cancel, { once: true });
      try {
        let bytes: Uint8Array;
        if (book.source === "demo") bytes = await readDemo(book);
        else if (desktop && book.path) bytes = await readPdf(book.path);
        else {
          const file = await cachedFile(book.id);
          if (!file) throw new Error("请打开或重新定位 PDF 后生成封面");
          if (file.size > 512 * 1024 * 1024)
            throw new Error("PDF 超过大小限制");
          bytes = new Uint8Array(await file.arrayBuffer());
        }
        check(signal);
        const signature = await documentSignature(bytes);
        check(signal);
        task = loadPdf(bytes);
        // Do not display password prompts while browsing the shelf.
        task.onPassword = () => {
          void task?.destroy().catch(() => {});
        };
        const pdf = await task.promise;
        check(signal);
        identifyBook(
          { version: 1, books: [book], dark: false },
          pdf.fingerprints[0] || pdf.fingerprints[1] || "",
          signature,
          pdf.numPages,
          book.id,
        );
        return await renderCover(book, pdf, signal);
      } finally {
        signal.removeEventListener("abort", cancel);
        await task?.destroy().catch(() => {});
      }
    },
    signal,
    3,
  );
}
