import {
  emptyToc,
  MAX_TOC_NODES,
  type GeneratedToc,
  type TocLine,
  type TocNode,
  type TocOptions,
  type TocPage,
} from "./types";
import { parsePrintedLayout, type PrintedEntry } from "./printed";
import { repairHeading } from "./ocr-text";
import { mappedPage, runningPageOffsets, textSimilarity } from "./page-map";

const numberPattern = "[0-9一二三四五六七八九十百零〇两]+";
export function headingLevel(text: string): number | null {
  const t = repairHeading(text);
  const cn = t.match(new RegExp(`^第\\s*${numberPattern}\\s*([编篇部章节])`));
  if (cn) return /[编篇部]/.test(cn[1]) ? 0 : cn[1] === "章" ? 1 : 2;
  if (/^part\s+(?:[ivxlcdm]+|\d+|[A-Z])\b/i.test(t)) return 0;
  if (/^(?:chapter|unit|lesson|appendix)\s+(?:\d+|[ivxlcdm]+|[A-Z])\b/i.test(t))
    return 1;
  if (/^附录\s*[A-Z一二三四五六七八九十\d]/i.test(t)) return 1;
  const numeric = t.match(
    /^(\d{1,3}(?:[.．]\d{1,3}){0,5})(?:[.、．]?\s+|(?=[\u3400-\u9fff]))\S/,
  );
  return numeric ? numeric[1].split(/[.．]/).length : null;
}
export function normalized(text: string): string {
  return text
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[\s\p{P}\p{S}]/gu, "");
}
function titleKey(text: string): string {
  return normalized(
    repairHeading(text)
      .replace(/^附录\s*[A-Z∧]\s*/i, "")
      .replace(new RegExp(`^第\\s*${numberPattern}\\s*[编篇部章节]\\s*`), "")
      .replace(
        /^(?:chapter|part|unit|lesson|appendix)\s+(?:\d+|[ivxlcdm]+|[A-Z])\b[\s:.-]*/i,
        "",
      )
      .replace(/^\d+(?:[.．]\d+)*[.、．]?\s*/, ""),
  );
}
const tocHeading = (s: string) =>
  /^(?:目\s*录|总\s*目\s*录|contents|table\s+of\s+contents)(?:\s*\([^)]*\))?$/i.test(
    s.trim(),
  );
const notChapter = (s: string) =>
  /^(?:图|表|公式|例题?|定理|证明|解[：:]|习题|练习|figure|table|equation|example|problem|exercise)\s*[（(\d:：]/i.test(
    s.trim(),
  ) || /^[（(]\d+(?:\.\d+)*[）)]/.test(s.trim());
const titleLike = (s: string) =>
  s.length >= 2 &&
  s.length <= 160 &&
  !/[。；;!?！？]$/.test(s) &&
  !/^[\d.\s]+$/.test(s) &&
  !notChapter(s);
type Entry = PrintedEntry;
export function parsePrintedPage(page: TocPage): Entry[] {
  return parsePrintedLayout(page, headingLevel);
}
function recurringMargins(pages: TocPage[]): Set<string> {
  const occurrences = new Map<string, Set<number>>();
  for (const p of pages)
    for (const line of p.lines)
      if (line.y < p.height * 0.085 || line.y > p.height * 0.92) {
        const key = normalized(line.text).replace(/\d+/g, "#");
        const set = occurrences.get(key) || new Set();
        set.add(p.page);
        occurrences.set(key, set);
      }
  return new Set(
    [...occurrences]
      .filter(
        ([, set]) => set.size >= Math.max(3, Math.ceil(pages.length * 0.15)),
      )
      .map(([key]) => key),
  );
}
function isMargin(line: TocLine, page: TocPage, repeated: Set<string>) {
  return (
    (line.y < page.height * 0.085 || line.y > page.height * 0.92) &&
    repeated.has(normalized(line.text).replace(/\d+/g, "#"))
  );
}
function bodySize(pages: TocPage[]): number {
  const sizes = new Map<number, number>();
  for (const p of pages)
    for (const l of p.lines)
      if (l.y > p.height * 0.08 && l.y < p.height * 0.9 && l.text.length > 15) {
        const size = Math.round(l.fontSize * 2) / 2;
        sizes.set(size, (sizes.get(size) || 0) + l.text.length);
      }
  return [...sizes].sort((a, b) => b[1] - a[1])[0]?.[0] || 12;
}
function makeNode(
  title: string,
  line: TocLine,
  source: TocNode["source"],
): TocNode {
  return {
    id: crypto.randomUUID(),
    parentId: null,
    title,
    source,
    sourcePage: line.page,
    target: { page: line.page, point: line.point },
    review: "needs-review",
    manuallyEdited: false,
  };
}
function numberCode(value: string): string {
  if (/^\d+$/.test(value)) return String(Number(value));
  const digits: Record<string, number> = {
    零: 0,
    〇: 0,
    一: 1,
    二: 2,
    两: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
  };
  if (/^[零〇一二两三四五六七八九十百]+$/.test(value)) {
    let total = 0,
      current = 0;
    for (const ch of value) {
      if (ch === "十" || ch === "百") {
        total += (current || 1) * (ch === "十" ? 10 : 100);
        current = 0;
      } else current = digits[ch];
    }
    return String(total + current);
  }
  if (/^[ivxlcdm]+$/i.test(value)) {
    const roman: Record<string, number> = {
      i: 1,
      v: 5,
      x: 10,
      l: 50,
      c: 100,
      d: 500,
      m: 1000,
    };
    const chars = [...value.toLowerCase()];
    return String(
      chars.reduce(
        (sum, ch, i) =>
          sum +
          (roman[ch] < (roman[chars[i + 1]] || 0) ? -roman[ch] : roman[ch]),
        0,
      ),
    );
  }
  return value.toLocaleLowerCase();
}
function chapterPath(title: string): string[] | null {
  const numeric = title.match(
    /^(\d+(?:\.\d+)*)(?:[.、]?\s+|(?=[\u3400-\u9fff]))/,
  );
  if (numeric) return numeric[1].split(".").map(numberCode);
  const cn = title.match(new RegExp(`^第\\s*(${numberPattern})\\s*章`));
  if (cn) return [numberCode(cn[1])];
  const en = title.match(
    /^(?:chapter|unit|lesson)\s+(\d+|[ivxlcdm]+|[A-Z])\b/i,
  );
  return en ? [numberCode(en[1])] : null;
}
function parentNodes(nodes: TocNode[], levels: number[]): void {
  const stack: { level: number; id: string; path: string[] | null }[] = [];
  nodes.forEach((node, i) => {
    const level = levels[i];
    while (stack.length && stack.at(-1)!.level >= level) stack.pop();
    const path = chapterPath(node.title);
    const ancestor =
      path && path.length > 1
        ? [...stack]
            .reverse()
            .find(
              (n) =>
                n.path &&
                n.path.length < path.length &&
                n.path.every((part, i) => part === path[i]),
            )
        : stack.at(-1);
    node.parentId = ancestor?.id || null;
    stack.push({ level, id: node.id, path });
  });
}
function detectBodyHeadings(
  pages: TocPage[],
  repeated: Set<string>,
): TocNode[] {
  const body = bodySize(pages);
  const candidates: { line: TocLine; level: number | null }[] = [];
  for (const page of pages)
    for (let i = 0; i < page.lines.length; i++) {
      const line = page.lines[i],
        level = headingLevel(line.text);
      if (
        !titleLike(line.text) ||
        tocHeading(line.text) ||
        isMargin(line, page, repeated) ||
        line.y > page.height * 0.93 ||
        line.text.length > 110
      )
        continue;
      if (
        /^(?:list of (?:figures|tables)|插图目录|图表目录|索引|index)$/i.test(
          line.text,
        )
      )
        continue;
      const previous = page.lines[i - 1];
      const separated =
        !previous ||
        line.y - previous.y - previous.height >= line.fontSize * 0.5;
      const emphasized = line.fontSize >= body * 1.2;
      const numbered =
        level !== null &&
        (line.fontSize >= body * 1.08 ||
          (level >= 2 && separated) ||
          /^(?:第|chapter|part|unit|appendix|附录)/i.test(line.text));
      if (!emphasized && !numbered) continue;
      // Numbered questions and ordinary sentences should not become a chapter.
      if (
        /[。；;!?！？]$/.test(line.text) ||
        (!emphasized && line.text.length > 70)
      )
        continue;
      candidates.push({ line, level });
    }
  const fontRanks = [
    ...new Set(candidates.map((c) => Math.round(c.line.fontSize))),
  ].sort((a, b) => b - a);
  const nodes = candidates.map((c) =>
    makeNode(c.line.text, c.line, "body-heading"),
  );
  const levels = candidates.map(
    (c) =>
      c.level ??
      Math.min(3, fontRanks.indexOf(Math.round(c.line.fontSize)) + 1),
  );
  parentNodes(nodes, levels);
  return nodes;
}
function matchingLines(pages: TocPage[], repeated: Set<string>): TocLine[] {
  const lines: TocLine[] = [];
  for (const p of pages) {
    const clean = p.lines.filter(
      (l) =>
        titleLike(l.text) && !isMargin(l, p, repeated) && l.y < p.height * 0.94,
    );
    for (let i = 0; i < clean.length; i++) {
      const line = clean[i];
      lines.push(line);
      const next = clean[i + 1];
      if (
        next &&
        Math.abs(line.x - next.x) < line.fontSize * 2 &&
        next.y - line.y < line.height * 2.4 &&
        next.y > line.y &&
        Math.abs(line.fontSize - next.fontSize) < line.fontSize * 0.2 &&
        line.text.length + next.text.length < 160
      )
        lines.push({ ...line, text: line.text + " " + next.text });
    }
  }
  return lines;
}
function resolvePrinted(
  entries: Entry[],
  body: TocPage[],
  allPages: TocPage[],
  options: TocOptions,
  repeated: Set<string>,
): TocNode[] {
  const lines = matchingLines(body, repeated),
    bodyFont = bodySize(body);
  const fullIndex = new Map<string, TocLine[]>(),
    titleIndex = new Map<string, TocLine[]>();
  const pageMap = new Map(allPages.map((p) => [p.page, p]));
  const fullKey = (s: string) => normalized(repairHeading(s));
  for (const line of lines) {
    const full = fullKey(line.text),
      key = titleKey(line.text);
    fullIndex.set(full, [...(fullIndex.get(full) || []), line]);
    if (key.length >= 2)
      titleIndex.set(key, [...(titleIndex.get(key) || []), line]);
  }
  const rootEntry = (entry: Entry) =>
    /^第.*章|^附录|^(?:Chapter|Part|Appendix)/i.test(entry.title);
  const plausible = (entry: Entry, line: TocLine) => {
    const page = pageMap.get(line.page)!;
    if (rootEntry(entry))
      return line.y < page.height * 0.36 && line.fontSize >= bodyFont * 1.25;
    return (
      line.fontSize >= bodyFont * 1.06 ||
      (headingLevel(repairHeading(line.text)) !== null &&
        line.text.length < 100)
    );
  };
  const choices = entries.map((entry) => {
    const full = (fullIndex.get(fullKey(entry.title)) || []).filter((line) =>
      plausible(entry, line),
    );
    const found = full.length
      ? full
      : titleIndex.get(titleKey(entry.title)) || [];
    return [
      ...new Map(
        found
          .filter((line) => plausible(entry, line))
          .map((line) => [line.page + ":" + Math.round(line.y), line]),
      ).values(),
    ];
  });
  const nodes = entries.map(
    (entry) =>
      ({
        ...makeNode(entry.title, entry.line, "printed-toc"),
        printedLabel: entry.printedLabel || undefined,
        target: null,
        review: "unresolved",
      }) as TocNode,
  );
  const anchors: { index: number; offset: number }[] = [];
  choices.forEach((found, i) => {
    if (found.length === 1) {
      nodes[i].target = { page: found[0].page, point: found[0].point };
      nodes[i].review = "verified";
      if (/^\d+$/.test(entries[i].printedLabel))
        anchors.push({
          index: i,
          offset: found[0].page - Number(entries[i].printedLabel),
        });
    }
  });
  const headerEvidence = runningPageOffsets(body);
  const realLabels = options.labels?.some((l, i) => l !== String(i + 1));
  const bodyPages = new Set(body.map((p) => p.page));
  const predictedPages: (number | null)[] = entries.map((entry, i) => {
    if (!entry.printedLabel) return null;
    let predicted: number | null = null;
    if (realLabels) {
      const found = options.labels!.indexOf(entry.printedLabel);
      if (found >= 0) predicted = found + 1;
    }
    const numeric = /^\d+$/.test(entry.printedLabel)
      ? Number(entry.printedLabel)
      : null;
    if (predicted === null && numeric !== null && options.pageOffset !== 0)
      predicted = numeric + options.pageOffset;
    if (predicted === null && numeric !== null) {
      // Independent running folios avoid calibrating an entire book from one wrong match.
      predicted = mappedPage(numeric, headerEvidence, allPages.length);
      if (predicted === null) {
        const before = anchors.filter((a) => a.index < i).at(-1),
          after = anchors.find((a) => a.index > i);
        const pair =
          before && after
            ? [before, after]
            : before
              ? anchors.slice(-2)
              : anchors.slice(0, 2);
        if (pair.length === 2 && pair[0].offset === pair[1].offset)
          predicted = numeric + pair[0].offset;
      }
    }
    return predicted !== null && bodyPages.has(predicted) ? predicted : null;
  });
  entries.forEach((entry, i) => {
    const expected = predictedPages[i];
    // Keep a unique prominent title; a page number printed by OCR can itself be wrong.
    if (nodes[i].target) return;
    if (expected === null) return;
    const a = titleKey(entry.title),
      full = fullKey(entry.title);
    const candidates = lines
      .filter((line) => line.page === expected && plausible(entry, line))
      .map((line) => {
        const b = titleKey(line.text),
          f = fullKey(line.text);
        const score = Math.max(textSimilarity(a, b), textSimilarity(full, f));
        return { line, score };
      })
      .filter((c) => c.score >= (a.length <= 4 ? 0.74 : 0.8))
      .sort((x, y) => y.score - x.score || y.line.fontSize - x.line.fontSize);
    if (
      candidates.length &&
      (candidates.length === 1 ||
        candidates[0].score > candidates[1].score ||
        candidates[0].line.y === candidates[1].line.y)
    ) {
      nodes[i].target = { page: expected, point: candidates[0].line.point };
      nodes[i].review =
        candidates[0].score >= 0.9 ? "verified" : "needs-review";
    } else {
      nodes[i].target = { page: expected };
      nodes[i].review = "needs-review";
    }
  });
  // The page's appendix heading is independent evidence for OCR-confused letters.
  nodes.forEach((node, i) => {
    if (!/^附录\s*[A-Z]/i.test(node.title) || !node.target?.point) return;
    const targetPage = pageMap.get(node.target.page);
    const marker = targetPage?.lines
      .map((l) => l.text.normalize("NFKC").replace(/[|\s]/g, ""))
      .find((t) => /^附录[A-Z]$/i.test(t));
    if (marker && predictedPages[i] === node.target.page)
      node.title = node.title.replace(/^附录\s*[A-Z]\s*/i, marker + " ");
  });
  const columnBase = new Map<string, number>();
  const columnKey = (e: Entry) => `${e.line.page}:${e.line.column ?? 0}`;
  for (const e of entries)
    columnBase.set(
      columnKey(e),
      Math.min(columnBase.get(columnKey(e)) ?? Infinity, e.line.x),
    );
  parentNodes(
    nodes,
    entries.map(
      (e) =>
        e.level ??
        1 +
          Math.min(
            3,
            Math.round((e.line.x - columnBase.get(columnKey(e))!) / 12),
          ),
    ),
  );
  return nodes;
}

export function analyzePages(
  pages: TocPage[],
  options: TocOptions,
): {
  toc: GeneratedToc;
  message: string;
  method: "printed" | "headings";
  tocPages: number[];
} {
  const repeated = recurringMargins(pages);
  const parsed = pages.map((p) => parsePrintedPage(p));
  const selected = new Set<number>();
  const excludedPages = new Set<number>();
  if (options.mode !== "headings")
    pages.forEach((page, i) => {
      if (options.range) {
        if (page.page >= options.range[0] && page.page <= options.range[1])
          selected.add(page.page);
        return;
      }
      const entries = parsed[i];
      const hasHeading = page.lines.some((l) => tocHeading(l.text));
      const excluded = page.lines.some((l) =>
        /^(?:图表目录|插图目录|表目录|list of (?:figures|tables)|index|索引)$/i.test(
          l.text.trim(),
        ),
      );
      const leaders = entries.filter((e) => e.leaders).length;
      if (excluded) excludedPages.add(page.page);
      if (
        !excluded &&
        ((hasHeading && entries.length >= 1) ||
          (entries.length >= 3 && leaders >= 3) ||
          (entries.length >= 5 &&
            entries.filter((e) => e.level !== null).length / entries.length >
              0.6 &&
            entries.length / page.lines.length > 0.45))
      )
        selected.add(page.page);
    });
  // Continue a printed table across pages when the next page has the same dense layout.
  if (!options.range && options.mode !== "headings")
    for (let i = 1; i < pages.length; i++)
      if (
        selected.has(pages[i - 1].page) &&
        !excludedPages.has(pages[i].page) &&
        parsed[i].length >= 2 &&
        parsed[i].length / pages[i].lines.length >= 0.5
      )
        selected.add(pages[i].page);
  const entries = pages.flatMap((p, i) =>
    selected.has(p.page) ? parsed[i] : [],
  );
  const printed = options.mode !== "headings" && entries.length > 0;
  if (options.mode === "printed" && !printed)
    throw new Error(
      "所选页面没有识别到可读目录。请调整页范围；扫描目录需要 OCR，也可以手动添加。",
    );
  const body = pages.filter((p) => !selected.has(p.page));
  const nodes = printed
    ? resolvePrinted(entries, body, pages, options, repeated)
    : detectBodyHeadings(pages, repeated);
  if (nodes.length > MAX_TOC_NODES)
    throw new Error("候选目录过多，请改为指定印刷目录页，或手动建立目录。");
  const meaningful = pages.filter(
    (p) =>
      p.lines.reduce(
        (sum, l) => sum + (l.text.match(/[\p{L}\p{N}]/gu)?.length || 0),
        0,
      ) >= 30,
  ).length;
  const unresolved = nodes.filter((n) => n.review !== "verified").length;
  const message = !nodes.length
    ? meaningful
      ? "没有找到可靠的章节标题，可以指定目录页或手动添加。"
      : "文字层不足，扫描教材需要 OCR；当前可手动创建目录。"
    : `识别到 ${nodes.length} 项${printed ? "印刷目录" : "正文标题"}${unresolved ? `，${unresolved} 项待核对` : "，已匹配正文位置"}。${meaningful < pages.length * 0.5 ? "部分页面文字较少，可能需要 OCR。" : ""}`;
  return {
    toc: { ...emptyToc(options.documentSignature), nodes },
    message,
    method: printed ? "printed" : "headings",
    tocPages: [...selected],
  };
}
