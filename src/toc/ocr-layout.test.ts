import { describe, it, expect } from "vitest";
import { detectGutter } from "./extract";
import { analyzePages, parsePrintedPage } from "./analyze";
import { ocrDigits, repairHeading } from "./ocr-text";
import { runningPageOffsets, mappedPage } from "./page-map";
import type { TocLine, TocPage, TocOptions } from "./types";

const opts: TocOptions = {
  mode: "auto",
  labels: null,
  pageOffset: 0,
  documentSignature: "sha256:" + "a".repeat(64),
};
const line = (
  text: string,
  page: number,
  y: number,
  fontSize = 12,
  x = 50,
  width = 210,
  column = 0,
): TocLine => ({
  text,
  page,
  y,
  x,
  width,
  fontSize,
  height: fontSize,
  point: [x, 800 - y],
  column,
});
const page = (n: number, lines: TocLine[], gutter?: number): TocPage => ({
  page: n,
  width: 600,
  height: 800,
  lines,
  gutter,
});

describe("OCR-backed printed contents", () => {
  it("repairs numeric fields without corrupting ordinary acronyms", () => {
    expect(ocrDigits("/O6")).toBe("106");
    expect(ocrDigits("J/6")).toBe("316");
    expect(ocrDigits("2‘")).toBeNull();
    expect(repairHeading("第↑|章 自动化")).toBe("第11章 自动化");
    expect(repairHeading("l02 基础知识", 10)).toBe("10.2 基础知识");
    expect(repairHeading("ll』0 本章小结", 11)).toBe("11.10 本章小结");
    expect(repairHeading("IP 网络")).toBe("IP 网络");
    expect(repairHeading("IO接口")).toBe("IO接口");
  });
  it("detects a narrow gutter instead of joining adjacent columns", () => {
    const items = Array.from({ length: 5 }, (_, i) => [
      {
        text: `第${i + 1}章 概念..........1`,
        x: 50,
        width: 220,
        baseline: 100 + i * 20,
        font: 12,
      },
      {
        text: `第${i + 6}章 方法..........9`,
        x: 285,
        width: 235,
        baseline: 100 + i * 20,
        font: 12,
      },
    ]).flat();
    const gutter = detectGutter(items, 600);
    expect(gutter).toBeGreaterThanOrEqual(269);
    expect(gutter).toBeLessThanOrEqual(286);
    expect(
      detectGutter(
        items.filter((i) => i.x === 50),
        600,
      ),
    ).toBeUndefined();
  });
  it("joins small shifted page labels and restores section hierarchy after OCR errors", () => {
    const p = page(
      1,
      [
        line("第l章 基础知识......", 1, 100, 14),
        line("。 /0", 1, 103, 8, 265, 20),
        line("l.l 基本概念....I2", 1, 135),
        line("l2 应用方法.....I4", 1, 165),
        line("第2章 进阶方法.....2O", 1, 100, 14, 300, 235, 1),
        line("2.l 模型......2/", 1, 135, 12, 315, 220, 1),
        line("22 实践......22", 1, 165, 12, 315, 220, 1),
      ],
      290,
    );
    const entries = parsePrintedPage(p);
    expect(entries.map((e) => [e.title, e.printedLabel])).toEqual([
      ["第1章 基础知识", "10"],
      ["1.1 基本概念", "12"],
      ["1.2 应用方法", "14"],
      ["第2章 进阶方法", "20"],
      ["2.1 模型", "21"],
      ["2.2 实践", "22"],
    ]);
  });
  it("uses independent folios and prominent titles instead of introductory references", () => {
    const pages = Array.from({ length: 16 }, (_, i) =>
      page(i + 1, [
        line(
          "This is a sufficiently long paragraph about some topic in the textbook.",
          i + 1,
          300,
          11,
        ),
        ...(i >= 3 ? [line(`${i - 2} 第l章`, i + 1, 25, 9)] : []),
      ]),
    );
    pages[0] = page(1, [
      line("Contents", 1, 30, 20),
      line("第1章 第一课......1", 1, 100),
      line("第2章 第二课......7", 1, 130),
      line("第3章 第三课......10", 1, 160),
    ]);
    pages[1].lines.push(line("第2章 第二课", 2, 190, 11));
    pages[3].lines.push(line("第一课", 4, 100, 22));
    pages[9].lines.push(line("第二课", 10, 100, 22));
    pages[12].lines.push(line("笫三课", 13, 100, 22));
    const offsets = runningPageOffsets(pages.slice(1));
    expect(mappedPage(7, offsets, 16)).toBe(10);
    const result = analyzePages(pages, opts);
    expect(result.toc.nodes.map((n) => n.target?.page)).toEqual([4, 10, 13]);
    expect(result.toc.nodes[1].target?.point).toEqual([50, 700]);
  });
  it("corrects an appendix letter only when the actual destination header supplies evidence", () => {
    const pages = Array.from({ length: 12 }, (_, i) =>
      page(i + 1, [
        line(
          "This is a long paragraph of ordinary chapter prose.",
          i + 1,
          300,
          11,
        ),
        ...(i > 1 ? [line(String(i - 1), i + 1, 25, 9)] : []),
      ]),
    );
    pages[0] = page(1, [
      line("Contents", 1, 30, 20),
      line("附录O 额外材料.......8", 1, 100),
    ]);
    pages[9].lines.push(
      line("|附录D", 10, 60, 12),
      line("额外材料", 10, 130, 22),
    );
    const result = analyzePages(pages, opts);
    expect(result.toc.nodes[0].title).toBe("附录D 额外材料");
    expect(result.toc.nodes[0].target?.page).toBe(10);
  });
});
