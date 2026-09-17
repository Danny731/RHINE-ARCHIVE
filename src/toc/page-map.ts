import type { TocPage } from "./types";
import { ocrDigits } from "./ocr-text";

export type PageOffsetEvidence = {
  offset: number;
  support: number;
  first: number;
  last: number;
};
export function runningPageOffsets(pages: TocPage[]): PageOffsetEvidence[] {
  const votes = new Map<number, Set<number>>();
  for (const page of pages) {
    const values = new Set<number>();
    for (const line of page.lines) {
      if (line.y > page.height * 0.1 && line.y < page.height * 0.9) continue;
      if (line.text.length > 65) continue;
      const t = line.text.normalize("NFKC").replace(/^[|{}\s]+|[|{}\s]+$/g, "");
      const leading = t.match(/^([\dIlijJOo/↑′]{1,5})(?:\s|(?=第)|$)/);
      const trailing = t.match(/(?:^|\s)([\dIlijJOo/↑′]{1,5})$/);
      for (const token of [leading?.[1], trailing?.[1]])
        if (token) {
          const number = ocrDigits(token);
          if (
            number &&
            Number(number) >= 1 &&
            Number(number) <= pages.at(-1)!.page
          )
            values.add(Number(number));
        }
    }
    for (const number of values) {
      const offset = page.page - number;
      const evidence = votes.get(offset) || new Set();
      evidence.add(page.page);
      votes.set(offset, evidence);
    }
  }
  return [...votes]
    .filter(([, set]) => set.size >= 5)
    .map(([offset, set]) => ({
      offset,
      support: set.size,
      first: Math.min(...set),
      last: Math.max(...set),
    }))
    .sort((a, b) => b.support - a.support);
}
export function mappedPage(
  label: number,
  evidence: PageOffsetEvidence[],
  total: number,
): number | null {
  const candidates = evidence.filter(
    (e) =>
      label + e.offset >= Math.max(1, e.first - 3) &&
      label + e.offset <= Math.min(total, e.last + 3),
  );
  if (!candidates.length) return null;
  if (
    candidates.length > 1 &&
    candidates[0].support < candidates[1].support * 2
  )
    return null;
  return label + candidates[0].offset;
}
export function textSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (
    !a ||
    !b ||
    Math.abs(a.length - b.length) > Math.max(a.length, b.length) * 0.35
  )
    return 0;
  let row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++)
      next[j] = Math.min(
        row[j] + 1,
        next[j - 1] + 1,
        row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    row = next;
  }
  return 1 - row[b.length] / Math.max(a.length, b.length);
}
