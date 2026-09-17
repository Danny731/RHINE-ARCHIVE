// Repair OCR confusions only inside numeric fields, never in arbitrary prose.
const digitMap: Record<string, string> = {
  I: "1",
  l: "1",
  i: "1",
  "|": "1",
  "/": "1",
  "\\": "1",
  "↑": "1",
  "′": "1",
  O: "0",
  o: "0",
  J: "3",
  j: "3",
};
export function ocrDigits(token: string): string | null {
  const value = [...token.normalize("NFKC").trim()]
    .map((c) => digitMap[c] ?? c)
    .join("");
  return /^\d{1,5}$/.test(value) ? String(Number(value)) : null;
}
export const leadersPattern = /[.·…．。°•●,\s]{3,}/;
export function numericFragment(text: string): boolean {
  const t = text.normalize("NFKC").replace(/[.·…。°•●,\s!』]/g, "");
  return (
    (!!t &&
      (/^[0-9IlijJOo|/\\↑′‘“”]{1,6}$/.test(t) ||
        /^[ivxlcdm]{1,12}$/i.test(t))) ||
    /^[.·…。°•●,\s!』]+$/.test(text)
  );
}
export function repairHeading(text: string, chapter?: number): string {
  let t = text
    .normalize("NFKC")
    .trim()
    .replace(/[`』]+$/g, "");
  t = t.replace(
    /^第\s*([\dIl|/↑O]{1,3})\s*章\s*/,
    (_, n) => `第${ocrDigits(n) ?? n}章 `,
  );
  t = t.replace(/^附录\s*∧\s*/, "附录A ");
  t = t.replace(
    /^([0-9IlijJOo|/↑′.·』]{1,9})\s*(?=[\u3400-\u9fffA-Z])/,
    (prefix) => {
      const token = prefix.trim().replace(/』/g, ".1").replace(/·/g, ".");
      if (!/[0-9.]/.test(token)) return prefix;
      const segments = token.split(".");
      if (segments.some((s) => !ocrDigits(s))) return prefix;
      let number = segments.map((s) => ocrDigits(s)!).join(".");
      if (
        !number.includes(".") &&
        chapter !== undefined &&
        number.startsWith(String(chapter)) &&
        number.length > String(chapter).length
      )
        number = `${chapter}.${Number(number.slice(String(chapter).length))}`;
      return number + " ";
    },
  );
  return t.trim();
}
export function chapterNumber(text: string): number | null {
  const m = repairHeading(text).match(/^第(\d+)章/);
  return m ? Number(m[1]) : null;
}
