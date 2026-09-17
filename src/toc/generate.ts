import type { PDFDocumentProxy } from "pdfjs-dist";
import { analyzePages } from "./analyze";
import { checkCancelled, extractPages, type Progress } from "./extract";
import type { TocOptions } from "./types";

export async function generateToc(
  pdf: PDFDocumentProxy,
  options: TocOptions,
  signal: AbortSignal,
  onProgress: (p: Progress) => void,
) {
  const pages = await extractPages(pdf, signal, onProgress);
  checkCancelled(signal);
  onProgress({
    done: pdf.numPages,
    total: pdf.numPages,
    message: "正在核对标题与实际页码",
  });
  await new Promise((r) => setTimeout(r, 0));
  checkCancelled(signal);
  const result = analyzePages(pages, options);
  checkCancelled(signal);
  return result;
}
export async function documentSignature(data: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    data as Uint8Array<ArrayBuffer>,
  );
  return (
    "sha256:" +
    [...new Uint8Array(digest)]
      .map((n) => n.toString(16).padStart(2, "0"))
      .join("")
  );
}
