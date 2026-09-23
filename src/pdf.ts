import {
  GlobalWorkerOptions,
  TextLayer,
  getDocument,
  type PDFDocumentProxy,
} from "pdfjs-dist";
import workerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";
GlobalWorkerOptions.workerSrc = workerUrl;
// Pin generic Latin font families: Chinese system defaults otherwise differ
// between canvas font measurement and DOM text selection on Windows.
TextLayer.fontFamilyMap.set("serif", '"Times New Roman", serif');
TextLayer.fontFamilyMap.set("sans-serif", "Arial, sans-serif");
TextLayer.fontFamilyMap.set("monospace", '"Courier New", monospace');
export type Outline = { title: string; dest: unknown; depth: number };
export { cachePageSizes, pageSizeOf } from "./page-geometry";
export async function outlineOf(pdf: PDFDocumentProxy): Promise<Outline[]> {
  const items = await pdf.getOutline();
  const result: Outline[] = [];
  function visit(nodes: NonNullable<typeof items>, depth: number) {
    for (const n of nodes) {
      result.push({ title: n.title, dest: n.dest, depth });
      visit(n.items, depth + 1);
    }
  }
  if (items) visit(items, 0);
  return result;
}
export async function destinationPage(
  pdf: PDFDocumentProxy,
  dest: unknown,
): Promise<number | null> {
  const resolved =
    typeof dest === "string" ? await pdf.getDestination(dest) : dest;
  if (!Array.isArray(resolved) || !resolved.length) return null;
  return typeof resolved[0] === "number"
    ? resolved[0] + 1
    : (await pdf.getPageIndex(resolved[0])) + 1;
}
export function loadPdf(data: Uint8Array) {
  return getDocument({
    data,
    cMapUrl: "/pdf-assets/cmaps/",
    cMapPacked: true,
    standardFontDataUrl: "/pdf-assets/standard_fonts/",
    wasmUrl: "/pdf-assets/wasm/",
  });
}
