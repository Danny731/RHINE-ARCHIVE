import { PDFDocument, StandardFonts, rgb, degrees } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { readFile, writeFile, mkdir } from "node:fs/promises";
await mkdir("tests/fixtures", { recursive: true });
const doc = await PDFDocument.create();
const font = await doc.embedFont(StandardFonts.Helvetica);
for (let i = 0; i < 500; i++) {
  const p = doc.addPage([595, 842]);
  p.drawText(`Textbook performance fixture / page ${i + 1}`, {
    x: 48,
    y: 760,
    size: 18,
    font,
  });
  for (let j = 0; j < 28; j++)
    p.drawText(
      `Study note ${j + 1}: vectors, matrices, and systems of linear equations.`,
      { x: 48, y: 710 - j * 21, size: 10, font },
    );
}
await writeFile("tests/fixtures/large.pdf", await doc.save());
const mixed = await PDFDocument.create();
mixed.registerFontkit(fontkit);
const chinese = await mixed.embedFont(
  await readFile("C:/Windows/Fonts/simhei.ttf"),
  { subset: true },
);
for (let i = 0; i < 7; i++) {
  const p = mixed.addPage(i % 2 ? [842, 595] : [595, 842]);
  p.drawText(`教材测试：第 ${i + 1} 页`, {
    x: 45,
    y: p.getHeight() - 65,
    size: 24,
    font: chinese,
    color: rgb(0.2, 0.3, 0.2),
  });
  p.drawText("向量相加与线性变换，中文文字应清晰显示并可以选择。", {
    x: 45,
    y: p.getHeight() - 110,
    size: 15,
    font: chinese,
  });
  if (i === 2) p.setRotation(degrees(90));
}
await writeFile("tests/fixtures/中文混合页面.pdf", await mixed.save());
console.log("Created 500-page and Chinese mixed-size/rotation test fixtures.");
