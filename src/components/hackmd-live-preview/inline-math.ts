export type InlineMathMatch = {
  /** Offset of the opening delimiter within the line. */
  from: number;
  /** Offset just past the closing delimiter. */
  to: number;
  /** The TeX between the delimiters. */
  source: string;
  /** `$$…$$` on one line: HackMD renders it as display math, `$…$` as inline math. */
  display: boolean;
};

// `$$…$$` within a line. The delimiters must not be escaped, and the body must not be empty.
const displayMathPattern = /(?<![\\$])\$\$(?!\$)((?:\\.|[^\n\\$]|\$(?!\$))+?)\$\$(?!\$)/g;
// `$…$`: no space just inside either delimiter, and no `$` beside them, so `$$` never reads as two.
const inlineMathPattern = /(?<![\\$])\$(?![\s$])((?:\\.|[^\n$\\])+?)(?<!\s)\$(?!\$)/g;

/** The math spans of one line, display (`$$…$$`) first and `$…$` in the text between them. */
export function findInlineMath(text: string): InlineMathMatch[] {
  const matches: InlineMathMatch[] = [];
  for (const match of text.matchAll(displayMathPattern)) {
    const source = match[1] ?? '';
    if (match.index === undefined || source.trim().length === 0) continue;
    matches.push({ from: match.index, to: match.index + match[0].length, source: source.trim(), display: true });
  }

  for (const match of text.matchAll(inlineMathPattern)) {
    if (match.index === undefined || !match[1]) continue;
    const from = match.index;
    const to = from + match[0].length;
    if (matches.some((other) => other.display && from < other.to && to > other.from)) continue;
    matches.push({ from, to, source: match[1], display: false });
  }

  return matches.sort((a, b) => a.from - b.from);
}
