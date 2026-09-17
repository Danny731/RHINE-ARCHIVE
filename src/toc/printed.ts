import type { TocLine, TocPage } from "./types";
import {
  chapterNumber,
  leadersPattern,
  numericFragment,
  ocrDigits,
  repairHeading,
} from "./ocr-text";

export type PrintedEntry = {
  title: string;
  printedLabel: string;
  line: TocLine;
  level: number | null;
  leaders: boolean;
  pageWasRepaired?: boolean;
};
const heading = (s: string) =>
  /^(?:目\s*录|总\s*目\s*录|contents|table\s+of\s+contents)$/i.test(s.trim());

export function parsePrintedLayout(
  page: TocPage,
  getLevel: (s: string) => number | null,
): PrintedEntry[] {
  const columns =
    page.gutter !== undefined ||
    page.lines.some(
      (l) =>
        l.x > page.width * 0.48 &&
        l.text.length > 8 &&
        /\s\d+\s*$/.test(l.text),
    );
  const column = (l: TocLine) =>
    page.gutter !== undefined
      ? (l.column ?? Number(l.x >= page.gutter))
      : columns
        ? Number(l.x > page.width * 0.48)
        : 0;
  const ordered = [...page.lines].sort(
    (a, b) => column(a) - column(b) || a.y - b.y || a.x - b.x,
  );
  const lines: TocLine[] = [];
  for (const line of ordered) {
    const prior = lines.at(-1);
    if (
      prior &&
      column(prior) === column(line) &&
      Math.abs(prior.y - line.y) <=
        Math.max(3, Math.max(prior.fontSize, line.fontSize) * 0.65) &&
      (numericFragment(prior.text) || numericFragment(line.text)) &&
      Math.min(prior.x + prior.width, line.x + line.width) <=
        Math.max(prior.x, line.x) + 5
    ) {
      const [left, right] = prior.x <= line.x ? [prior, line] : [line, prior];
      lines[lines.length - 1] = {
        ...left,
        text: left.text + " " + right.text,
        width: Math.max(left.x + left.width, right.x + right.width) - left.x,
        fontSize: Math.max(left.fontSize, right.fontSize),
      };
    } else lines.push({ ...line });
  }
  const result: PrintedEntry[] = [];
  for (const col of [...new Set(lines.map(column))]) {
    const group = lines.filter((l) => column(l) === col);
    let currentChapter: number | undefined;
    for (const line of group) {
      const m = repairHeading(line.text).match(/^(\d+)\.\d+/);
      if (m) {
        currentChapter = Number(m[1]);
        break;
      }
    }
    let pending: TocLine | null = null;
    for (const line of group) {
      if (heading(line.text)) {
        pending = null;
        continue;
      }
      // Dot leaders often contain full stops, degree signs and spaced OCR fragments.
      let match = line.text.match(
        /^(.+?)[.·…．。°•●,\s!』`]{2,}([0-9IlijJOo|/\\↑′‘“”ivxcm]+)\s*$/i,
      );
      if (!match)
        match = line.text.match(/^(.+?)\s+(\d{1,5}|[ivxlcdm]{1,12})\s*$/i);
      if (!match) {
        if (
          line.text.length >= 2 &&
          line.text.length <= 140 &&
          /\p{L}/u.test(line.text) &&
          !/[。；;!?！？]$/.test(line.text)
        )
          pending = line;
        continue;
      }
      let title = match[1].replace(/[.·…．。°•●,\s!』`]+$/g, "").trim();
      let source = line;
      if (
        pending &&
        line.y - pending.y < Math.max(36, line.height * 2.3) &&
        Math.abs(line.x - pending.x) < line.fontSize * 3 &&
        getLevel(repairHeading(title)) === null &&
        getLevel(repairHeading(pending.text)) !== null
      ) {
        title = pending.text + " " + title;
        source = pending;
      }
      pending = null;
      if (
        title.length < 2 ||
        title.length > 200 ||
        !/\p{L}/u.test(title) ||
        heading(title)
      )
        continue;
      const root = chapterNumber(title);
      if (root !== null) currentChapter = root;
      title = repairHeading(title, currentChapter);
      const level =
        getLevel(title) ??
        (/^(?:习题|练习|本章小结|软件|推荐阅读|Exercises|Summary)$/i.test(
          title,
        ) && currentChapter !== undefined
          ? 2
          : /^(?:参考文献|索引|前言|序言|References|Index|Preface)$/i.test(
                title,
              )
            ? 1
            : null);
      const token = match[2].trim();
      const roman = /^[ivxlcdm]+$/i.test(token) && getLevel(title) === null;
      const printedLabel = roman ? token : (ocrDigits(token) ?? "");
      result.push({
        title,
        printedLabel,
        line: source,
        level,
        leaders: leadersPattern.test(line.text),
        pageWasRepaired: printedLabel !== token,
      });
    }
  }
  return result;
}
