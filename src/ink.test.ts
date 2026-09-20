import { describe, it, expect } from "vitest";
import {
  applyInkChange,
  hitsStroke,
  InkHistory,
  validateInk,
  type InkStroke,
} from "./ink";
import {
  initialPosition,
  mergeLibraries,
  validateLibrary,
  type Book,
  type Library,
} from "./model";
import { exportInkPdf } from "./export-ink";
import {
  PDFDocument,
  PDFRawStream,
  PDFArray,
  decodePDFRawStream,
  degrees,
  PDFName,
} from "pdf-lib";

const stroke: InkStroke = {
  id: "s1",
  page: 1,
  color: "#b44436",
  width: 2,
  created: 1,
  points: [
    [20, 30],
    [80, 30],
  ],
};
const legacy: Book = {
  id: "book",
  title: "旧书",
  source: "file",
  path: "C:/旧教材.pdf",
  pages: 2,
  opened: 1,
  position: initialPosition(),
  secondary: initialPosition(),
  mode: "continuous",
  split: false,
  pageOffset: 0,
  bookmarks: [{ id: "bookmark", page: 2, title: "复习" }],
  marks: [
    {
      id: "mark",
      page: 1,
      kind: "note",
      note: "旧笔记",
      quote: "",
      rects: [],
      created: 1,
    },
  ],
};
const library = (b: Book): Library => ({ version: 1, dark: false, books: [b] });

describe("handwriting and legacy data", () => {
  it("accepts the legacy library unchanged and roundtrips/merges optional ink without losing old content", () => {
    expect(validateLibrary(library(legacy))).toEqual(library(legacy));
    const current = library({ ...legacy, inkStrokes: [stroke] });
    expect(validateLibrary(JSON.parse(JSON.stringify(current)))).toEqual(
      current,
    );
    const merged = mergeLibraries(
      current,
      library({
        ...legacy,
        inkStrokes: [
          { ...stroke, color: "#ffffff" },
          { ...stroke, id: "s2" },
        ],
      }),
    );
    expect(merged.books[0].inkStrokes).toEqual([
      stroke,
      { ...stroke, id: "s2" },
    ]);
    expect(merged.books[0].marks).toEqual(legacy.marks);
    expect(merged.books[0].path).toEqual(legacy.path);
    expect(
      mergeLibraries(current, library(legacy)).books[0].inkStrokes,
    ).toEqual([stroke]);
  });
  it("rejects corrupted strokes, duplicate IDs, out-of-range pages and invalid colors", () => {
    for (const patch of [
      { points: [] },
      { points: [[NaN, 2]] },
      { points: [[1]] },
      { width: -1 },
      { width: Infinity },
      { color: "url(x)" },
      { page: 3 },
      { created: NaN },
      { id: "" },
    ]) {
      expect(() => validateInk([{ ...stroke, ...patch }], 2)).toThrow();
    }
    expect(() => validateInk([stroke, stroke], 2)).toThrow();
  });
  it("erases across sparse pointer events, thick lines and single dots without hitting distant parallel lines", () => {
    expect(hitsStroke(stroke, [50, 0], [50, 60], 0)).toBe(true);
    expect(hitsStroke(stroke, [10, 31], [90, 31], 0)).toBe(true);
    expect(hitsStroke(stroke, [10, 40], [90, 40], 3)).toBe(false);
    expect(
      hitsStroke({ ...stroke, points: [[50, 30]] }, [40, 30], [60, 30], 1),
    ).toBe(true);
    expect(hitsStroke(stroke, [50, 30], [50, 30], 0)).toBe(true);
  });
  it("keeps undo histories isolated by document, restores erased batches, preserves imported strokes, and clears redo after new writing", () => {
    const history = new InkHistory();
    const other = { ...stroke, id: "s2", created: 2 };
    history.record("a", { added: [stroke], removed: [] });
    history.record("b", { added: [other], removed: [] });
    expect(applyInkChange([stroke, other], history.take("a", false)!)).toEqual([
      other,
    ]);
    expect(history.state("b").undo).toHaveLength(1);
    expect(applyInkChange([other], history.take("a", true)!)).toEqual([
      stroke,
      other,
    ]);
    history.record("a", { added: [], removed: [stroke, other] });
    expect(applyInkChange([], history.take("a", false)!)).toEqual([
      stroke,
      other,
    ]);
    history.record("a", { added: [{ ...stroke, id: "new" }], removed: [] });
    expect(history.take("a", true)).toBeUndefined();
  });
});

describe("PDF handwriting copy", () => {
  it("preserves source bytes, page rotation/crop and existing content while exporting raw PDF coordinates with round strokes/dots", async () => {
    const original = await PDFDocument.create();
    const first = original.addPage([400, 500]);
    first.setCropBox(10, 20, 250, 300);
    first.setRotation(degrees(90));
    first.drawText("Original text");
    original.addPage([300, 300]);
    const bytes = await original.save();
    const before = bytes.slice();
    const result = await exportInkPdf(bytes, [
      stroke,
      { ...stroke, id: "dot", page: 2, points: [[50, 60]], width: 8 },
    ]);
    expect(bytes).toEqual(before);
    const copy = await PDFDocument.load(result);
    expect(copy.getPageCount()).toBe(2);
    expect(copy.getPage(0).getRotation().angle).toBe(90);
    expect(copy.getPage(0).getCropBox()).toEqual({
      x: 10,
      y: 20,
      width: 250,
      height: 300,
    });
    const contents = copy.getPage(0).node.Contents() as PDFArray;
    const operators = Array.from({ length: contents.size() }, (_, i) =>
      new TextDecoder().decode(
        decodePDFRawStream(contents.lookup(i, PDFRawStream)).decode(),
      ),
    ).join("\n");
    expect(operators).toContain("20 30 m");
    expect(operators).toContain("80 30 l");
    expect(operators).toContain("1 J");
    expect(operators).toContain("1 j");
    expect(operators).toContain("Tj");
    await expect(
      exportInkPdf(bytes, [{ ...stroke, page: 3 }]),
    ).rejects.toThrow();
  });
  it("rejects encrypted source instead of exporting a damaged decrypted-looking copy", async () => {
    const doc = await PDFDocument.create();
    doc.addPage();
    doc.context.trailerInfo.Encrypt = doc.context.register(
      doc.context.obj({ Filter: PDFName.of("Standard") }),
    );
    await expect(exportInkPdf(await doc.save(), [stroke])).rejects.toThrow(
      "加密 PDF",
    );
  });
});
