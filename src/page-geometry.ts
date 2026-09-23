import type { PDFDocumentProxy } from "pdfjs-dist";

type Size = { width: number; height: number };
type Index = {
  sizes: Map<number, Size>;
  pending: Map<number, Promise<Size>>;
  fallback: Size;
  version: number;
  listeners: Set<() => void>;
  initial?: Promise<void>;
};
const indexes = new WeakMap<PDFDocumentProxy, Index>();
function indexOf(pdf: PDFDocumentProxy): Index {
  let index = indexes.get(pdf);
  if (!index) {
    index = {
      sizes: new Map(),
      pending: new Map(),
      fallback: { width: 612, height: 792 },
      version: 0,
      listeners: new Set(),
    };
    indexes.set(pdf, index);
  }
  return index;
}
function changed(index: Index) {
  index.version++;
  for (const listener of index.listeners) listener();
}
function readSize(pdf: PDFDocumentProxy, number: number): Promise<Size> {
  const index = indexOf(pdf);
  const size = index.sizes.get(number);
  if (size) return Promise.resolve(size);
  let pending = index.pending.get(number);
  if (!pending) {
    pending = pdf
      .getPage(number)
      .then((page) => {
        const { width, height } = page.getViewport({ scale: 1 });
        const size = { width, height };
        index.sizes.set(number, size);
        return size;
      })
      .finally(() => index.pending.delete(number));
    index.pending.set(number, pending);
  }
  return pending;
}
export function pageSizeOf(pdf: PDFDocumentProxy, number: number): Size {
  const index = indexOf(pdf);
  return index.sizes.get(number) || index.fallback;
}
export async function ensurePageSize(
  pdf: PDFDocumentProxy,
  number: number,
): Promise<Size> {
  const before = pageSizeOf(pdf, number);
  const size = await readSize(pdf, number);
  if (size.width !== before.width || size.height !== before.height)
    changed(indexOf(pdf));
  return size;
}
export function subscribePageSizes(
  pdf: PDFDocumentProxy,
  listener: () => void,
) {
  const index = indexOf(pdf);
  index.listeners.add(listener);
  return () => {
    index.listeners.delete(listener);
  };
}
export const geometryVersion = (pdf: PDFDocumentProxy) => indexOf(pdf).version;

export function cachePageSizes(
  pdf: PDFDocumentProxy,
  priority: number[] = [],
): Promise<void> {
  const index = indexOf(pdf);
  if (!index.initial)
    index.initial = (async () => {
      index.fallback = await readSize(pdf, 1);
      const first = [...new Set([2, ...priority])]
        .filter((n) => n > 1 && n <= pdf.numPages)
        .slice(0, 4);
      await Promise.all(first.map((n) => readSize(pdf, n)));
      changed(index);
      // Geometry is progressively indexed without holding up the first page.
      // Yield between small batches so two panes do not flood the worker queues.
      const background = async () => {
        for (let start = 1; start <= pdf.numPages; start += 4) {
          if (pdf.loadingTask.destroyed) return;
          let differs = false;
          await Promise.all(
            Array.from(
              { length: Math.min(4, pdf.numPages - start + 1) },
              async (_, offset) => {
                const n = start + offset,
                  before = pageSizeOf(pdf, n);
                const size = await readSize(pdf, n);
                differs ||=
                  size.width !== before.width || size.height !== before.height;
              },
            ),
          );
          if (differs) changed(index);
          await new Promise((resolve) => setTimeout(resolve, 16));
        }
      };
      setTimeout(() => {
        void background().catch(() => {});
      }, 0);
    })();
  return index.initial;
}
