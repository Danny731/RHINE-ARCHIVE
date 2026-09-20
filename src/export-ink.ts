import {
  PDFDocument,
  PDFHexString,
  rgb,
  LineCapStyle,
  LineJoinStyle,
  pushGraphicsState,
  popGraphicsState,
  setStrokingColor,
  setLineWidth,
  setLineCap,
  setLineJoin,
  moveTo,
  lineTo,
  stroke,
} from "pdf-lib";
import { validateInk, type InkStroke } from "./ink";

/** Flatten handwriting into a separate PDF; original page coordinates include CropBox offsets. */
export async function exportInkPdf(
  source: Uint8Array,
  strokes: InkStroke[],
): Promise<Uint8Array> {
  let document: PDFDocument;
  try {
    document = await PDFDocument.load(source, { updateMetadata: false });
  } catch (error) {
    if (error instanceof Error && /encrypted/i.test(error.message))
      throw new Error(
        "此加密 PDF 暂不支持导出手写副本，笔迹仍保存在书库，可通过 JSON 备份保存。",
      );
    throw error;
  }
  validateInk(strokes, document.getPageCount());
  // A copy must have its own PDF fingerprint; otherwise reopening it can bind
  // to the original book and display the same handwriting twice.
  const id = PDFHexString.of(crypto.randomUUID().replaceAll("-", ""));
  document.context.trailerInfo.ID = document.context.obj([id, id]);
  const pages = document.getPages();
  for (const s of strokes) {
    const page = pages[s.page - 1];
    const color = rgb(
      ...([1, 3, 5].map((i) => parseInt(s.color.slice(i, i + 2), 16) / 255) as [
        number,
        number,
        number,
      ]),
    );
    if (s.points.length === 1) {
      page.drawCircle({
        x: s.points[0][0],
        y: s.points[0][1],
        size: s.width / 2,
        color,
      });
    } else {
      page.pushOperators(
        pushGraphicsState(),
        setStrokingColor(color),
        setLineWidth(s.width),
        setLineCap(LineCapStyle.Round),
        setLineJoin(LineJoinStyle.Round),
        moveTo(...s.points[0]),
        ...s.points.slice(1).map((p) => lineTo(...p)),
        stroke(),
        popGraphicsState(),
      );
    }
  }
  return document.save();
}
