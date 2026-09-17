import { describe, expect, it } from "vitest";
import { analyzePages, headingLevel, parsePrintedPage } from "./analyze";
import {
  emptyToc,
  validateToc,
  type TocLine,
  type TocNode,
  type TocOptions,
  type TocPage,
} from "./types";
import {
  initialPosition,
  mergeLibraries,
  validateLibrary,
  type Book,
} from "../model";

const signature = "sha256:" + "a".repeat(64);
const options: TocOptions = {
  mode: "auto",
  labels: null,
  pageOffset: 0,
  documentSignature: signature,
};
function line(
  text: string,
  page: number,
  y = 100,
  fontSize = 18,
  x = 50,
): TocLine {
  return {
    text,
    page,
    y,
    fontSize,
    x,
    width: 200,
    height: fontSize,
    point: [x, 800 - y],
  };
}
function page(number: number, lines: TocLine[]): TocPage {
  return { page: number, width: 600, height: 800, lines };
}
function body(number: number, title?: string): TocPage {
  return page(number, [
    line("LINEAR ALGEBRA", number, 25, 10),
    ...(title ? [line(title, number, 160)] : []),
    line(
      "This is a long paragraph explaining the mathematical ideas and concepts in this chapter.",
      number,
      260,
      12,
    ),
    line(
      "This second paragraph continues the lesson with examples and detailed explanations.",
      number,
      290,
      12,
    ),
    line("1. Calculate the following values.", number, 330, 12),
    line("Figure 1.2 A diagram", number, 370, 20),
    line("(1.2)", number, 420, 18),
    line(String(number), number, 770, 10),
  ]);
}

describe("automatic textbook outlines", () => {
  it("does not append a figure list as a continuation of the chapter contents", () => {
    const result = analyzePages(
      [
        page(1, [
          line("Contents", 1, 30),
          line("Chapter 1 Vectors ... 1", 1, 80, 12),
        ]),
        page(2, [
          line("List of Figures", 2, 30),
          line("First drawing ... 2", 2, 80, 12),
          line("Second drawing ... 3", 2, 110, 12),
        ]),
        body(3, "Chapter 1 Vectors"),
      ],
      options,
    );
    expect(result.toc.nodes.map((n) => n.title)).toEqual(["Chapter 1 Vectors"]);
  });
  it("keeps decimal chapter segments and Chinese levels distinct", () => {
    expect(headingLevel("1.10 Vector spaces")).toBe(2);
    expect(headingLevel("1.1.3 Bases")).toBe(3);
    expect(headingLevel("第一章 向量")).toBe(1);
    expect(headingLevel("第 二 节 线性变换")).toBe(2);
    expect(headingLevel("Part II Spaces")).toBe(0);
    expect(headingLevel("(1.2)")).toBeNull();
  });
  it("reconstructs wrapped printed entries and two columns", () => {
    const p = page(2, [
      line("Contents", 2, 30, 20),
      line("Chapter 1 Vectors .... 1", 2, 80, 11),
      line("1.1 Vector spaces and", 2, 110, 11),
      line("linear maps .... 2", 2, 126, 11),
      line("Chapter 2 Matrices .... 4", 2, 80, 11, 330),
      line("2.1 Products .... 5", 2, 110, 11, 342),
    ]);
    const entries = parsePrintedPage(p);
    expect(entries.map((e) => e.title)).toEqual([
      "Chapter 1 Vectors",
      "1.1 Vector spaces and linear maps",
      "Chapter 2 Matrices",
      "2.1 Products",
    ]);
  });
  it("matches printed titles to actual body pages, including numbering resets", () => {
    const pages = [
      body(1),
      page(2, [
        line("目录", 2, 30),
        line("第一章 向量 ........ 1", 2, 90, 12),
        line("1.1 向量空间 ........ 2", 2, 115, 12),
        line("第二章 矩阵 ........ 4", 2, 140, 12),
        line("附录 A 参考资料 ........ 1", 2, 165, 12),
        line("3.1 Missing entry ........ 99", 2, 190, 12),
      ]),
      body(3),
      body(4, "第一章 向量"),
      body(5, "1.1 向量空间"),
      body(6),
      body(7, "第二章 矩阵"),
      body(8, "附录 A 参考资料"),
    ];
    const result = analyzePages(pages, options);
    expect(result.method).toBe("printed");
    expect(result.toc.nodes.map((n) => n.target?.page ?? null)).toEqual([
      4,
      5,
      7,
      8,
      null,
    ]);
    expect(result.toc.nodes[1].parentId).toBe(result.toc.nodes[0].id);
    expect(result.toc.nodes[4].review).toBe("unresolved");
    expect(result.toc.nodes[4].parentId).toBeNull();
    expect(result.toc.nodes[0].target?.point).toEqual([50, 640]);
    validateToc(result.toc, pages.length);
  });
  it("extracts real body headings without promoting repeated headers, questions or equations", () => {
    const result = analyzePages(
      [
        body(1, "Chapter 1 Vectors"),
        body(2, "1.1 Vector spaces"),
        body(3),
        body(4, "Chapter 2 Matrices"),
        body(5, "2.1 Matrix products"),
      ],
      { ...options, mode: "headings" },
    );
    expect(result.toc.nodes.map((n) => n.title)).toEqual([
      "Chapter 1 Vectors",
      "1.1 Vector spaces",
      "Chapter 2 Matrices",
      "2.1 Matrix products",
    ]);
    expect(result.toc.nodes[1].parentId).toBe(result.toc.nodes[0].id);
    expect(result.toc.nodes.every((n) => n.review === "needs-review")).toBe(
      true,
    );
  });
  it("keeps duplicate targets unresolved without evidence and rejects a bad explicit range", () => {
    const pages = [
      page(1, [
        line("Contents", 1, 30),
        line("Introduction ........ 1", 1, 100, 12),
      ]),
      body(2, "Introduction"),
      body(3, "Introduction"),
    ];
    const result = analyzePages(pages, options);
    expect(result.toc.nodes[0].target).toBeNull();
    expect(() =>
      analyzePages(pages, { ...options, mode: "printed", range: [2, 2] }),
    ).toThrow(/没有识别到/);
  });
  it("does not fabricate headings for an image-only PDF", () => {
    const result = analyzePages([page(1, []), page(2, [])], options);
    expect(result.toc.nodes).toHaveLength(0);
    expect(result.message).toContain("OCR");
  });
});

const baseBook: Book = {
  id: "test",
  title: "教材",
  source: "file",
  pages: 20,
  opened: 1,
  position: initialPosition(),
  secondary: initialPosition(),
  mode: "continuous",
  split: false,
  pageOffset: 0,
  bookmarks: [],
  marks: [],
};
const node: TocNode = {
  id: "a",
  parentId: null,
  title: "章节",
  target: { page: 2, point: [40, 600] },
  source: "manual",
  review: "verified",
  sourcePage: 2,
  manuallyEdited: true,
};
describe("directory persistence and backup compatibility", () => {
  it("rejects merging incompatible content versions without overwriting the local directory", () => {
    const local = {
      ...baseBook,
      documentSignature: signature,
      generatedToc: { ...emptyToc(signature), nodes: [node] },
    };
    const incoming = {
      ...baseBook,
      documentSignature: "sha256:" + "b".repeat(64),
    };
    expect(() =>
      mergeLibraries(
        { version: 1, dark: false, books: [local] },
        { version: 1, dark: false, books: [incoming] },
      ),
    ).toThrow(/文档版本/);
    expect(local.generatedToc.nodes[0].title).toBe("章节");
  });
  it("loads legacy libraries and validates all saved and draft outlines", () => {
    expect(
      validateLibrary({ version: 1, dark: false, books: [baseBook] }),
    ).toBeTruthy();
    const toc = { ...emptyToc(signature), nodes: [node] };
    expect(
      validateLibrary({
        version: 1,
        dark: false,
        books: [
          { ...baseBook, generatedToc: toc, tocDraft: toc, previousToc: toc },
        ],
      }),
    ).toBeTruthy();
    expect(() =>
      validateLibrary({
        version: 1,
        dark: false,
        books: [
          {
            ...baseBook,
            tocDraft: { ...toc, nodes: [{ ...node, target: { page: 21 } }] },
          },
        ],
      }),
    ).toThrow();
  });
  it("rejects cycles, orphaned parents, duplicate IDs and non-finite coordinates", () => {
    for (const nodes of [
      [{ ...node, parentId: "a" }],
      [{ ...node, parentId: "missing" }],
      [node, node],
      [{ ...node, target: { page: 2, point: [Infinity, 0] } }],
    ])
      expect(() =>
        validateToc({ ...emptyToc(signature), nodes }, 20),
      ).toThrow();
  });
  it("preserves manually edited local directories when a backup has newer reading progress", () => {
    const localToc = {
      ...emptyToc(signature),
      nodes: [{ ...node, title: "我修改的章节" }],
    };
    const incomingToc = {
      ...emptyToc(signature),
      nodes: [{ ...node, title: "旧目录" }],
    };
    const merged = mergeLibraries(
      {
        version: 1,
        dark: false,
        books: [{ ...baseBook, generatedToc: localToc }],
      },
      {
        version: 1,
        dark: false,
        books: [{ ...baseBook, opened: 100, generatedToc: incomingToc }],
      },
    );
    expect(merged.books[0].generatedToc?.nodes[0].title).toBe("我修改的章节");
  });
});
