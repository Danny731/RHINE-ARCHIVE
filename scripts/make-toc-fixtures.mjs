import { PDFDocument, StandardFonts, PDFHexString, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { readFile, writeFile, mkdir } from "node:fs/promises";
await mkdir("tests/fixtures", { recursive: true });
const chineseBytes = await readFile("C:/Windows/Fonts/simhei.ttf");
async function make(name, withContents) {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(chineseBytes, { subset: true });
  const latin = await doc.embedFont(StandardFonts.Helvetica);
  if (withContents)
    doc.context.trailerInfo.ID = doc.context.obj([
      PDFHexString.of("FACE0123456789ABCDEF0123456789AB"),
      PDFHexString.of("FACE0123456789ABCDEF0123456789AB"),
    ]);
  const total = withContents ? 10 : 5;
  const headings = withContents
    ? {
        4: "第一章 向量",
        5: "1.1 向量空间与线性变换",
        7: "第二章 矩阵",
        8: "2.1 矩阵乘法",
        10: "附录 A 参考资料",
      }
    : {
        1: "第一章 向量",
        2: "1.1 向量空间与线性变换",
        4: "第二章 矩阵",
        5: "2.1 矩阵乘法",
      };
  for (let i = 1; i <= total; i++) {
    const page = doc.addPage([595, 842]);
    const text = (value, x, y, size = 12, f = font) =>
      page.drawText(value, {
        x,
        y: 842 - y,
        size,
        font: f,
        color: rgb(0.18, 0.28, 0.22),
      });
    text("线性代数 · 本地测试教材", 48, 32, 9);
    if (withContents && i === 2) {
      text("目录", 48, 82, 24);
      text("第一章 向量 ........ 1", 48, 150, 12);
      text("1.1 向量空间与", 60, 182, 12);
      text("线性变换 ........ 2", 60, 200, 12);
      text("第二章 矩阵 ........ 4", 320, 150, 12);
      text("2.1 矩阵乘法 ........ 5", 332, 182, 12);
      text("附录 A 参考资料 ........ 1", 320, 230, 12);
      text("3.1 尚未收录的章节 ........ 99", 48, 265, 12);
    } else {
      if (headings[i])
        text(
          headings[i],
          48,
          i === 5 ? 360 : 160,
          /^\d/.test(headings[i]) ? 18 : 24,
        );
      for (let j = 0; j < 7; j++)
        text(
          "向量和矩阵用于描述线性关系。本段为正文，用于检查章节识别和实际跳转位置。",
          48,
          430 + j * 24,
          11,
        );
      text("1. 计算下列各题。", 48, 635, 12);
      text("图 1.2 坐标示意", 48, 685, 16);
      text("(1.2)", 440, 725, 20, latin);
    }
    text(String(i), 285, 810, 10, latin);
  }
  await writeFile(`tests/fixtures/${name}.pdf`, await doc.save());
  if (withContents) {
    doc
      .getPages()[0]
      .drawText("Revised textbook content", {
        x: 50,
        y: 650,
        font: latin,
        size: 14,
      });
    await writeFile("tests/fixtures/toc-printed-updated.pdf", await doc.save());
  }
}
await make("toc-printed", true);
await make("toc-headings", false);
const imageOnly = await PDFDocument.create();
for (let i = 0; i < 2; i++) {
  const p = imageOnly.addPage([595, 842]);
  p.drawRectangle({
    x: 45,
    y: 500,
    width: 450,
    height: 200,
    color: rgb(0.87, 0.9, 0.85),
  });
}
await writeFile("tests/fixtures/toc-no-text.pdf", await imageOnly.save());
console.log(
  "Created printed contents, body headings, and no-text TOC fixtures.",
);
