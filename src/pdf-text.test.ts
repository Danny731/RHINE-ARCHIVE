import { describe, it, expect, vi } from "vitest";
import type {
  PDFPageProxy,
  TextContent,
  TextItem,
} from "pdfjs-dist/types/src/display/api";
import { readPdfText } from "./pdf-text";

const item = (str: string) => ({ str }) as TextItem;
function pageFor(stream: ReadableStream<TextContent>) {
  Object.defineProperty(stream, Symbol.asyncIterator, { value: undefined });
  return {
    isPureXfa: false,
    streamTextContent: () => stream,
    getTextContent: () => {
      throw new Error("Unsupported async iteration path");
    },
  } as unknown as PDFPageProxy;
}

describe("PDF text stream compatibility", () => {
  it("reads streams without async iterators while preserving text, fonts and first non-null language", async () => {
    const first = { fontFamily: "serif" } as TextContent["styles"][string];
    const second = {
      fontFamily: "sans-serif",
    } as TextContent["styles"][string];
    const stream = new ReadableStream<TextContent>({
      start(controller) {
        controller.enqueue({
          items: [item("第一章")],
          styles: { a: first },
          lang: null,
        });
        controller.enqueue({
          items: [item("向量")],
          styles: { b: second },
          lang: "zh-CN",
        });
        controller.enqueue({ items: [], styles: {}, lang: "en" });
        controller.close();
      },
    });
    const result = await readPdfText(pageFor(stream));
    expect(result.items).toEqual([item("第一章"), item("向量")]);
    expect(result.styles).toMatchObject({ a: first, b: second });
    expect(result.lang).toBe("zh-CN");
    expect(stream.locked).toBe(false);
  });

  it("cancels a pending read without returning partial results or leaving the stream locked", async () => {
    const cancelled = vi.fn();
    const stream = new ReadableStream<TextContent>({ cancel: cancelled });
    const abort = new AbortController();
    const pending = readPdfText(pageFor(stream), abort.signal);
    const rejected = expect(pending).rejects.toMatchObject({
      name: "AbortError",
    });
    abort.abort();
    await rejected;
    expect(cancelled).toHaveBeenCalledTimes(1);
    expect(cancelled.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(stream.locked).toBe(false);
  });

  it("keeps the XFA form text path and propagates read failures", async () => {
    const contents = { items: [item("form")], styles: {}, lang: null };
    const xfa = {
      isPureXfa: true,
      getTextContent: async () => contents,
      streamTextContent: vi.fn(),
    };
    expect(await readPdfText(xfa as unknown as PDFPageProxy)).toBe(contents);
    expect(xfa.streamTextContent).not.toHaveBeenCalled();
    const stream = new ReadableStream<TextContent>({
      start(controller) {
        controller.error(new Error("broken text"));
      },
    });
    await expect(readPdfText(pageFor(stream))).rejects.toThrow("broken text");
    expect(stream.locked).toBe(false);
  });
});
