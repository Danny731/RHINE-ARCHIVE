import { PDFDocument, StandardFonts, rgb, PDFName, PDFString } from "pdf-lib";
import { mkdir, writeFile } from "node:fs/promises";

const doc = await PDFDocument.create();
doc.setTitle("Linear Algebra - A Small Field Guide");
doc.setAuthor("Pagewise");
doc.setSubject("Original sample textbook for testing offline reading");
const serif = await doc.embedFont(StandardFonts.TimesRoman),
  italic = await doc.embedFont(StandardFonts.TimesRomanItalic),
  sans = await doc.embedFont(StandardFonts.Helvetica),
  bold = await doc.embedFont(StandardFonts.HelveticaBold),
  mono = await doc.embedFont(StandardFonts.Courier);
const green = rgb(0.19, 0.33, 0.26),
  muted = rgb(0.48, 0.53, 0.46),
  ink = rgb(0.2, 0.24, 0.2),
  gold = rgb(0.72, 0.61, 0.36);
const chapters = [
  {
    title: "A small field guide",
    sub: "LINEAR ALGEBRA",
    body: [
      "Linear algebra begins with a simple idea: complicated relationships can be described by combining a few familiar directions. A vector is a way to keep track of those directions and their sizes.",
      "This short, original guide is included with Pagewise so you can explore the reader without importing a book. Try selecting a sentence, adding a bookmark, or opening two different pages side by side.",
      "Read slowly. Draw the picture. Then test your understanding with a small example.",
    ],
    box: "READING MAP",
    boxBody:
      "Vectors  /  Linear combinations  /  Matrices  /  Systems\nGeometry  /  Exercises  /  Worked solutions",
  },
  {
    title: "Vectors and direction",
    sub: "01 / THE BASIC OBJECTS",
    body: [
      "A vector in the plane has two components. We write it as v = (x, y). The first component tells us how far to travel horizontally, and the second tells us how far to travel vertically.",
      "For example, the vector v = (3, 2) moves three units to the right and two units upward. Changing the starting point does not change the vector: direction and displacement are what matter.",
      "Vector addition combines displacements. Starting at the origin, first follow u and then follow v. The endpoint is the same as following the single vector u + v.",
    ],
    box: "TRY IT YOURSELF",
    boxBody:
      "Let u = (1, 2) and v = (3, -1).\nCalculate u + v, then draw all three vectors.",
    graph: true,
  },
  {
    title: "Linear combinations",
    sub: "02 / BUILDING WITH VECTORS",
    body: [
      "Multiplying a vector by a scalar changes its length. A negative scalar also reverses its direction. For instance, 2(1, 3) = (2, 6), while -1(1, 3) = (-1, -3).",
      "A linear combination is a sum of scaled vectors. Given vectors u and v, an expression of the form a u + b v is a linear combination. The scalars a and b tell us how much of each direction to use.",
      "The span of a collection of vectors is the set of all their linear combinations. Two nonparallel vectors in the plane span the whole plane. Parallel vectors span only one line.",
    ],
    box: "A WORKED EXAMPLE",
    boxBody: "u = (1, 0),  v = (1, 2)\n3u + 2v = 3(1, 0) + 2(1, 2) = (5, 4)",
  },
  {
    title: "Matrices as transformations",
    sub: "03 / FROM NUMBERS TO MOTION",
    body: [
      "A matrix can describe a transformation of space. Its columns tell us where the coordinate directions move. Once we know those two images, linearity determines where every other vector will go.",
      "The identity matrix leaves every vector unchanged. A diagonal matrix scales the coordinate directions independently. A shear keeps one axis fixed while sliding points parallel to it.",
      "Matrix multiplication represents composition. In the product AB, the transformation B acts first, followed by A. The order matters: in general, AB and BA are different.",
    ],
    box: "FOLLOW THE COLUMNS",
    boxBody:
      "A = [ 2  1 ]      A(1, 0) = (2, 0)\n    [ 0  1 ]      A(0, 1) = (1, 1)",
    graph: true,
  },
  {
    title: "Solving a linear system",
    sub: "04 / LOOKING FOR AN INTERSECTION",
    body: [
      "A system of two linear equations can be viewed as two lines. A solution is a point lying on both lines. The lines may intersect once, be parallel and distinct, or coincide.",
      "Elimination simplifies a system without changing its solution set. We can exchange equations, multiply an equation by a nonzero number, or add a multiple of one equation to another.",
      "A useful habit is to check a computed solution in the original equations. Arithmetic errors are easier to detect with a direct substitution than with another pass through the same calculations.",
    ],
    box: "ELIMINATION IN TWO STEPS",
    boxBody:
      "x + y = 5     and     2x - y = 1\nAdd the equations: 3x = 6, so x = 2.\nSubstitute back: y = 3.",
  },
  {
    title: "The geometry of a dot product",
    sub: "05 / MEASURING ALIGNMENT",
    body: [
      "The dot product of u = (u1, u2) and v = (v1, v2) is u1 v1 + u2 v2. It turns a pair of vectors into a single number that measures how strongly their directions align.",
      "For nonzero vectors, a positive dot product means the angle between them is less than a right angle. A negative value means the angle is greater than a right angle. A zero dot product means the vectors are perpendicular.",
      "The squared length of a vector equals its dot product with itself. This gives a direct connection between algebraic computation and geometric distance.",
    ],
    box: "QUICK CHECK",
    boxBody:
      "u = (2, 1),  v = (-1, 2)\nu dot v = 2(-1) + 1(2) = 0\nThese two vectors are perpendicular.",
    graph: true,
  },
  {
    title: "Exercises",
    sub: "06 / MAKE THE IDEAS YOUR OWN",
    body: [
      "1. Let u = (2, 3) and v = (-1, 4). Find u + v and 2u - v. Sketch the result of the addition using arrows.",
      "2. Write the vector (5, 4) as a linear combination of a = (1, 0) and b = (1, 2). Explain why the coefficients are unique.",
      "3. Solve the system x + y = 5 and 2x - y = 1. Verify your solution by substitution.",
      "4. Find the dot product of (2, 1) and (-1, 2). What does the result tell you about their directions?",
      "5. A transformation sends (1, 0) to (2, 0) and (0, 1) to (1, 1). Where does it send (3, 2)?",
    ],
    box: "USE THE READER",
    boxBody:
      "Keep this page in the main pane. Open page 8 in\nthe comparison pane to review the worked solutions.",
  },
  {
    title: "Worked solutions",
    sub: "07 / CHECK AND REFLECT",
    body: [
      "1. Add components to obtain u + v = (1, 7). Scaling and subtracting gives 2u - v = (4, 6) - (-1, 4) = (5, 2).",
      "2. The second component gives 2b = 4, so b = 2. The first component then gives a + b = 5, so a = 3. The two starting vectors are not parallel, which makes the coefficients unique.",
      "3. Add the equations to get 3x = 6. Thus x = 2 and y = 3. Check: 2 + 3 = 5 and 2(2) - 3 = 1.",
      "4. The dot product is 2(-1) + 1(2) = 0. The vectors are perpendicular.",
      "5. By linearity, the image is 3(2, 0) + 2(1, 1) = (8, 2).",
    ],
    box: "A LAST THOUGHT",
    boxBody:
      "Before moving on, explain one solution in your own\nwords. A short note is often more useful than a highlight.",
  },
];
function wrap(text, font, size, width) {
  const words = text.split(/\s+/);
  const lines = [];
  let line = "";
  for (const word of words) {
    const test = line ? line + " " + word : word;
    if (font.widthOfTextAtSize(test, size) > width) {
      lines.push(line);
      line = word;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}
const pages = [];
chapters.forEach((c, i) => {
  const p = doc.addPage([612, 792]);
  pages.push(p);
  p.drawText("PAGEWISE / STUDY EDITION", {
    x: 55,
    y: 747,
    size: 8,
    font: sans,
    color: muted,
  });
  p.drawLine({
    start: { x: 55, y: 733 },
    end: { x: 557, y: 733 },
    thickness: 0.6,
    color: rgb(0.81, 0.84, 0.78),
  });
  p.drawText(c.sub, { x: 55, y: 690, size: 9, font: bold, color: gold });
  const titleLines = wrap(c.title, serif, 30, 502);
  let y = 648;
  for (const line of titleLines) {
    p.drawText(line, { x: 55, y, size: 30, font: serif, color: green });
    y -= 34;
  }
  y -= 23;
  for (const paragraph of c.body) {
    for (const line of wrap(paragraph, serif, 12, 502)) {
      p.drawText(line, { x: 55, y, size: 12, font: serif, color: ink });
      y -= 19;
    }
    y -= 16;
  }
  if (c.graph && y > 240) {
    const gx = 410,
      gy = y - 68;
    p.drawLine({
      start: { x: gx - 95, y: gy },
      end: { x: gx + 70, y: gy },
      thickness: 1,
      color: muted,
    });
    p.drawLine({
      start: { x: gx, y: gy - 30 },
      end: { x: gx, y: gy + 80 },
      thickness: 1,
      color: muted,
    });
    p.drawLine({
      start: { x: gx, y: gy },
      end: { x: gx + 55, y: gy + 56 },
      thickness: 2,
      color: green,
    });
    p.drawCircle({ x: gx + 55, y: gy + 56, size: 3, color: green });
    p.drawText("v", {
      x: gx + 62,
      y: gy + 60,
      font: italic,
      size: 13,
      color: green,
    });
    p.drawText("Think in pictures.", {
      x: 55,
      y: gy + 20,
      font: italic,
      size: 16,
      color: muted,
    });
  }
  p.drawRectangle({
    x: 55,
    y: 92,
    width: 502,
    height: 105,
    color: rgb(0.95, 0.96, 0.92),
  });
  p.drawText(c.box, { x: 73, y: 175, size: 8, font: bold, color: green });
  c.boxBody
    .split("\n")
    .forEach((line, j) =>
      p.drawText(line, {
        x: 73,
        y: 151 - j * 18,
        size: 10,
        font: mono,
        color: ink,
      }),
    );
  p.drawLine({
    start: { x: 55, y: 65 },
    end: { x: 557, y: 65 },
    thickness: 0.5,
    color: rgb(0.84, 0.86, 0.81),
  });
  p.drawText("LINEAR ALGEBRA / AN ORIGINAL PAGEWISE SAMPLE", {
    x: 55,
    y: 47,
    size: 7,
    font: sans,
    color: muted,
  });
  p.drawText(String(i + 1), {
    x: 545,
    y: 47,
    size: 9,
    font: sans,
    color: muted,
  });
});
const outlines = doc.context.obj({ Type: "Outlines" });
const root = doc.context.register(outlines);
const items = chapters.map((c, i) =>
  doc.context.obj({
    Title: PDFString.of(c.title),
    Parent: root,
    Dest: [pages[i].ref, PDFName.of("Fit")],
  }),
);
const refs = items.map((item) => doc.context.register(item));
items.forEach((item, i) => {
  if (i > 0) item.set(PDFName.of("Prev"), refs[i - 1]);
  if (i < items.length - 1) item.set(PDFName.of("Next"), refs[i + 1]);
});
outlines.set(PDFName.of("First"), refs[0]);
outlines.set(PDFName.of("Last"), refs.at(-1));
outlines.set(PDFName.of("Count"), doc.context.obj(refs.length));
doc.catalog.set(PDFName.of("Outlines"), root);
await mkdir("public", { recursive: true });
await writeFile("public/sample.pdf", await doc.save());
console.log(
  "Created original sample textbook: 8 pages, text layer and outline.",
);
