import type {
  PDFDocumentProxy,
  TextItem,
} from "pdfjs-dist/types/src/display/api";
import type { TocPage } from "./types";
import { numericFragment, leadersPattern } from "./ocr-text";

export type Progress = { done: number; total: number; message: string };
export function checkCancelled(signal: AbortSignal) {
  if (signal.aborted) throw new DOMException("已取消目录生成", "AbortError");
}
const isLabel = numericFragment;
const isCjk = (s: string) => /[\u3400-\u9fff]/.test(s);

type PositionedItem = {
  text: string;
  x: number;
  baseline: number;
  font: number;
  width: number;
};
export function detectGutter(
  items: PositionedItem[],
  width: number,
): number | undefined {
  if (
    items.filter((i) => leadersPattern.test(i.text)).length < 3 &&
    !items.some((i) => /^(目录|Contents|Table of Contents)$/i.test(i.text))
  )
    return;
  const words = items.filter(
    (i) =>
      i.text.replace(/[^\p{L}]/gu, "").length >= 2 && !numericFragment(i.text),
  );
  let best: { x: number; score: number } | undefined;
  for (let x = width * 0.36; x < width * 0.64; x += 2) {
    const left = words.filter((i) => i.x + i.width <= x + 1),
      right = words.filter((i) => i.x >= x - 1),
      cross = words.length - left.length - right.length;
    const l = new Set(left.map((i) => Math.round(i.baseline / 10))).size,
      r = new Set(right.map((i) => Math.round(i.baseline / 10))).size;
    if (l < 3 || r < 3 || cross > words.length * 0.15) continue;
    const gap =
      Math.min(...right.map((i) => i.x)) -
      Math.max(...left.map((i) => i.x + i.width));
    if (gap < 4) continue;
    const score = Math.min(l, r) * 3 - cross * 8 + Math.min(30, gap) * 0.1;
    if (!best || score > best.score) best = { x, score };
  }
  return best?.x;
}

export async function extractPages(
  pdf: PDFDocumentProxy,
  signal: AbortSignal,
  onProgress: (p: Progress) => void,
): Promise<TocPage[]> {
  const pages: TocPage[] = [];
  let characters = 0;
  for (let number = 1; number <= pdf.numPages; number++) {
    checkCancelled(signal);
    const page = await pdf.getPage(number);
    const text = await page.getTextContent();
    checkCancelled(signal);
    const viewport = page.getViewport({ scale: 1, rotation: 0 });
    const items = text.items
      .filter((i): i is TextItem => "str" in i && !!i.str.trim())
      .map((item) => {
        const [x, baseline] = viewport.convertToViewportPoint(
          item.transform[4],
          item.transform[5],
        );
        const font = Math.max(
          1,
          Math.hypot(item.transform[2], item.transform[3]) * viewport.userUnit,
        );
        return {
          text: item.str.normalize("NFKC").trim(),
          x,
          baseline,
          font,
          width: Math.abs(item.width * viewport.userUnit),
        };
      })
      .filter(
        (i) =>
          Number.isFinite(i.x) &&
          Number.isFinite(i.baseline) &&
          Number.isFinite(i.font) &&
          i.font >= 2 &&
          !(
            i.text.length <= 4 &&
            /^[|{}■●]+$/.test(i.text) &&
            (i.x < viewport.width * 0.04 ||
              i.x > viewport.width * 0.9 ||
              i.font > 20)
          ) &&
          !/\uFFFD{2,}/.test(i.text),
      );
    characters += items.reduce((sum, i) => sum + i.text.length, 0);
    if (characters > 8_000_000)
      throw new Error(
        "这本书的文字量过大，自动目录暂不支持；可以先手动建立目录。",
      );
    const gutter = detectGutter(items, viewport.width);
    const column = (item: PositionedItem) =>
      gutter !== undefined && item.x >= gutter ? 1 : 0;
    const center = (item: PositionedItem) => item.baseline - item.font * 0.5;
    items.sort(
      (a, b) => column(a) - column(b) || center(a) - center(b) || a.x - b.x,
    );
    const rows: (typeof items)[] = [];
    for (const item of items) {
      const row = rows.at(-1);
      if (
        row &&
        column(row[0]) === column(item) &&
        Math.abs(center(row[0]) - center(item)) <=
          Math.max(2.2, Math.max(row[0].font, item.font) * 0.42)
      )
        row.push(item);
      else rows.push([item]);
    }
    const lines: TocPage["lines"] = [];
    for (const row of rows) {
      row.sort((a, b) => a.x - b.x);
      const segments: (typeof items)[] = [];
      for (const item of row) {
        const segment = segments.at(-1),
          previous = segment?.at(-1);
        const gap = previous ? item.x - previous.x - previous.width : 0;
        const newColumn =
          previous &&
          !isLabel(item.text) &&
          (gap > Math.max(item.font * 3, viewport.width * 0.055) ||
            (isLabel(previous.text) &&
              item.x > viewport.width * 0.38 &&
              gap > item.font));
        if (!segment || newColumn) segments.push([item]);
        else segment.push(item);
      }
      for (const segment of segments) {
        const first = segment[0];
        let content = first.text;
        for (let i = 1; i < segment.length; i++) {
          const previous = segment[i - 1],
            next = segment[i];
          const gap = next.x - previous.x - previous.width;
          const join =
            (isCjk(content.at(-1) || "") && isCjk(next.text[0])) ||
            gap < Math.min(previous.font, next.font) * 0.12;
          content += (join ? "" : " ") + next.text;
        }
        const fontSize = Math.max(...segment.map((s) => s.font));
        const y = Math.min(...segment.map((s) => s.baseline - s.font));
        const [px, py] = viewport.convertToPdfPoint(first.x, y);
        lines.push({
          text: content.trim(),
          page: number,
          x: first.x,
          y,
          width: Math.max(...segment.map((s) => s.x + s.width)) - first.x,
          height: fontSize,
          fontSize,
          point: [px, py],
          column: column(first),
        });
      }
    }
    // Multi-column reading order: group rows by their column start before parsing TOCs.
    pages.push({
      page: number,
      width: viewport.width,
      height: viewport.height,
      lines,
      gutter,
    });
    onProgress({
      done: number,
      total: pdf.numPages,
      message: "正在读取文字与章节位置",
    });
    if (number % 2 === 0) await new Promise((r) => setTimeout(r, 0));
  }
  return pages;
}
