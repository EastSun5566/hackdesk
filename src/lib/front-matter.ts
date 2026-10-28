/** Splits a leading `---` YAML block from a note. Line endings in the result are always `\n`. */
export function splitFrontMatter(markdown: string): { yaml: string | null; body: string } {
  const text = markdown.replace(/\r\n?/g, '\n');
  const match = /^---\n([\s\S]*?)\n(?:---|\.\.\.)[ \t]*(?:\n|$)/.exec(text);
  return match ? { yaml: match[1]!, body: text.slice(match[0].length) } : { yaml: null, body: text };
}
