import {
  emptyToc,
  MAX_TOC_NODES,
  type GeneratedToc,
  type TocLine,
  type TocNode,
  type TocOptions,
  type TocPage,
} from "./types";

const numberPattern = "[0-9一二三四五六七八九十百零〇两]+";
export function headingLevel(text: string): number | null {
  const t = text.normalize("NFKC").trim();
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
    text
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
type Entry = {
  title: string;
  printedLabel: string;
  line: TocLine;
  level: number | null;
  leaders: boolean;
};
export function parsePrintedPage(page: TocPage): Entry[] {
  // A title in the right half starts a second column; a bare page number does not.
  const twoColumns = page.lines.some(
    (l) =>
      l.x > page.width * 0.48 && l.text.length > 8 && /\s\d+\s*$/.test(l.text),
  );
  const lines = [...page.lines].sort(
    (a, b) =>
      (twoColumns
        ? Number(a.x > page.width * 0.48) - Number(b.x > page.width * 0.48)
        : 0) ||
      a.y - b.y ||
      a.x - b.x,
  );
  const result: Entry[] = [];
  let pending: TocLine | null = null;
  for (const line of lines) {
    if (tocHeading(line.text)) {
      pending = null;
      continue;
    }
    const match = line.text.match(
      /^(.*?)(?:\s*[.·…．]{2,}\s*|\s+)(\d{1,5}|[ivxlcdm]{1,12})\s*$/i,
    );
    if (match) {
      let title = match[1].replace(/[.·…．\s]+$/g, "").trim();
      let source = line;
      if (
        pending &&
        line.y - pending.y <= Math.max(36, line.height * 2.3) &&
        Math.abs(line.x - pending.x) < line.fontSize * 3 &&
        headingLevel(title) === null &&
        headingLevel(pending.text) !== null
      ) {
        title = pending.text + " " + title;
        source = pending;
      }
      if (titleLike(title) && !tocHeading(title))
        result.push({
          title,
          printedLabel: match[2],
          line: source,
          level: headingLevel(title),
          leaders: /[.·…．]{2,}/.test(line.text),
        });
      pending = null;
    } else
      pending = titleLike(line.text) && !/[.]$/.test(line.text) ? line : null;
  }
  return result;
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
  const lines = matchingLines(body, repeated);
  const fullIndex = new Map<string, TocLine[]>(),
    titleIndex = new Map<string, TocLine[]>();
  for (const line of lines) {
    const full = normalized(line.text),
      key = titleKey(line.text);
    fullIndex.set(full, [...(fullIndex.get(full) || []), line]);
    if (key.length >= 4)
      titleIndex.set(key, [...(titleIndex.get(key) || []), line]);
  }
  const choices = entries.map((entry) => {
    const found =
      fullIndex.get(normalized(entry.title)) ||
      titleIndex.get(titleKey(entry.title)) ||
      [];
    return [
      ...new Map(
        found.map((line) => [`${line.page}:${Math.round(line.y)}`, line]),
      ).values(),
    ];
  });
  const nodes = entries.map(
    (entry) =>
      ({
        ...makeNode(entry.title, entry.line, "printed-toc"),
        printedLabel: entry.printedLabel,
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
  const realLabels = options.labels?.some(
    (label, i) => label !== String(i + 1),
  );
  const excluded = new Set(
    allPages.filter((p) => !body.includes(p)).map((p) => p.page),
  );
  entries.forEach((entry, i) => {
    if (nodes[i].target) return;
    let expected: number | null = null;
    if (realLabels) {
      const found = options.labels!.indexOf(entry.printedLabel);
      if (found >= 0) expected = found + 1;
    }
    const numeric = /^\d+$/.test(entry.printedLabel)
      ? Number(entry.printedLabel)
      : null;
    if (expected === null && numeric !== null && options.pageOffset !== 0)
      expected = numeric + options.pageOffset;
    if (expected === null && numeric !== null && anchors.length >= 2) {
      const before = anchors.filter((a) => a.index < i).at(-1),
        after = anchors.find((a) => a.index > i);
      const pair =
        before && after
          ? [before, after]
          : before
            ? anchors.slice(-2)
            : anchors.slice(0, 2);
      if (pair.length === 2 && pair[0].offset === pair[1].offset)
        expected = numeric + pair[0].offset;
    }
    if (expected !== null) {
      const ranked = choices[i]
        .map((line) => ({ line, distance: Math.abs(line.page - expected!) }))
        .sort((a, b) => a.distance - b.distance);
      if (
        ranked.length &&
        (ranked.length === 1 || ranked[0].distance < ranked[1].distance) &&
        ranked[0].distance <= 2
      ) {
        nodes[i].target = {
          page: ranked[0].line.page,
          point: ranked[0].line.point,
        };
        nodes[i].review = "verified";
      } else if (
        expected >= 1 &&
        expected <= allPages.length &&
        !excluded.has(expected)
      ) {
        nodes[i].target = { page: expected };
        nodes[i].review = "needs-review";
      }
    }
  });
  const indents = [
    ...new Set(entries.map((e) => Math.round(e.line.x / 12))),
  ].sort((a, b) => a - b);
  parentNodes(
    nodes,
    entries.map(
      (e) =>
        e.level ?? 1 + Math.min(3, indents.indexOf(Math.round(e.line.x / 12))),
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
