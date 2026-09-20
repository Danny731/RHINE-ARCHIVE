import type {
  PDFPageProxy,
  TextContent,
} from "pdfjs-dist/types/src/display/api";

function checkAbort(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException("已取消文字读取", "AbortError");
}

/** PDF.js 6 getTextContent uses ReadableStream async iteration, which is missing
 * in some system WKWebViews even when the PDF.js compatibility build is used.
 * The reader API works on those engines and preserves the same text payload. */
export async function readPdfText(
  page: PDFPageProxy,
  signal?: AbortSignal,
): Promise<TextContent> {
  checkAbort(signal);
  // XFA text is produced from the form tree rather than a worker text stream.
  if (page.isPureXfa) {
    const text = await page.getTextContent();
    checkAbort(signal);
    return text;
  }
  const reader = page.streamTextContent().getReader();
  const text: TextContent = {
    items: [],
    styles: Object.create(null),
    lang: null,
  };
  const cancel = () => {
    void reader.cancel(new Error("Text extraction cancelled")).catch(() => {});
  };
  signal?.addEventListener("abort", cancel, { once: true });
  let complete = false;
  try {
    while (true) {
      checkAbort(signal);
      const { value, done } = await reader.read();
      checkAbort(signal);
      if (done) {
        complete = true;
        return text;
      }
      text.lang ??= value.lang;
      Object.assign(text.styles, value.styles);
      text.items.push(...value.items);
    }
  } finally {
    signal?.removeEventListener("abort", cancel);
    if (!complete)
      await reader.cancel(new Error("Text extraction stopped")).catch(() => {});
    reader.releaseLock();
  }
}
