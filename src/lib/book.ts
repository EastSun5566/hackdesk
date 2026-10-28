/**
 * A HackMD book is a note whose headings and bulleted links form a table of contents. Headings
 * and link-less bullets are sections, bulleted links are chapters, and `---` is a divider.
 */
export type BookNode =
  | { kind: 'section'; title: string; children: BookNode[] }
  | { kind: 'chapter'; title: string; target: string; newTab: boolean; index: number; children: BookNode[] }
  | { kind: 'divider' };

export type BookChapter = Extract<BookNode, { kind: 'chapter' }>;

export type Book = {
  nodes: BookNode[];
  /** Chapters in reading order; `chapter.index` is its place here. */
  chapters: BookChapter[];
};

type Parent = Extract<BookNode, { children: BookNode[] }>;
type Open = { node: Parent; depth: number };

const MAX_SECTION_DEPTH = 3;
const MAX_DEPTH = 4;

const HEADING = /^ {0,3}(#{1,6})\s+(.+?)\s*#*\s*$/;
const SETEXT = /^ {0,3}(=+|-+)\s*$/;
const BULLET = /^(\s*)[-*+]\s+(.*)$/;
const ORDERED = /^(\s*)\d+[.)]\s/;
const DIVIDER = /^ {0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/;
const FENCE = /^\s*(`{3,}|~{3,})/;
const LINK = /\[((?:\\.|[^\]\\])*)\]\(\s*<?([^)\s>]+)>?(?:\s+["'][^)]*["'])?\s*\)/;

/** Reads a book's table of contents from its Markdown. */
export function parseBook(markdown: string): Book {
  const nodes: BookNode[] = [];
  const chapters: BookChapter[] = [];
  // Sections made from link-less bullets; they are dropped when nothing under them opens.
  const listSections = new WeakSet<BookNode>();
  // Open heading sections by level, and the bullets nested under the latest one.
  let headings: Open[] = [];
  let bullets: (Open & { indent: number })[] = [];
  // Bullets nested in a numbered list are not part of the contents.
  let orderedIndent: number | null = null;
  let fence: string | null = null;
  // The text line just read, which a `===` or `---` line below turns into a heading.
  let paragraph: string | null = null;

  const add = (node: BookNode, parent: Open | undefined) => (parent ? parent.node.children.push(node) : nodes.push(node));

  const addHeading = (title: string, level: number) => {
    const depth = Math.min(level, MAX_SECTION_DEPTH);
    const node: Parent = { kind: 'section', title, children: [] };
    headings = headings.filter(open => open.depth < depth);
    add(node, headings.at(-1));
    headings.push({ node, depth });
    bullets = [];
    orderedIndent = null;
  };

  for (const line of withoutFrontMatter(markdown).split('\n')) {
    const fenceMark = FENCE.exec(line)?.[1];
    if (fence) {
      if (fenceMark?.[0] === fence[0] && fenceMark.length >= fence.length) fence = null;
      continue;
    }
    if (fenceMark) {
      fence = fenceMark;
      paragraph = null;
      continue;
    }
    if (!line.trim()) {
      paragraph = null;
      continue;
    }

    const setext = SETEXT.exec(line);
    if (setext && paragraph !== null) {
      addHeading(paragraph, setext[1]![0] === '=' ? 1 : 2);
      paragraph = null;
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading) {
      addHeading(heading[2]!, heading[1]!.length);
      paragraph = null;
      continue;
    }
    const indent = line.length - line.trimStart().length;
    if (DIVIDER.test(line)) {
      // An unindented divider ends the list above it.
      bullets = bullets.filter(open => open.indent < indent);
      add({ kind: 'divider' }, bullets.at(-1) ?? headings.at(-1));
      continue;
    }

    if (orderedIndent !== null && indent > orderedIndent) continue;
    orderedIndent = null;
    if (ORDERED.test(line)) {
      orderedIndent = indent;
      paragraph = null;
      continue;
    }

    const bullet = BULLET.exec(line);
    if (!bullet) {
      paragraph = line.trim();
      continue;
    }
    paragraph = null;
    bullets = bullets.filter(open => open.indent < indent);
    const parent = bullets.at(-1) ?? headings.at(-1);
    const depth = (parent?.depth ?? 0) + 1;
    const text = bullet[2]!;
    const link = LINK.exec(text);
    let node: Parent;
    if (link) {
      if (depth > MAX_DEPTH) continue;
      const title = unescape(link[1]!).trim() || link[2]!;
      const newTab = text.slice(link.index + link[0].length).includes('[target=_blank]');
      node = { kind: 'chapter', title, target: link[2]!, newTab, index: chapters.length, children: [] };
      chapters.push(node);
    } else {
      if (depth > MAX_SECTION_DEPTH) continue;
      node = { kind: 'section', title: unescape(text).trim(), children: [] };
      listSections.add(node);
    }
    add(node, parent);
    bullets.push({ node, depth, indent });
  }

  return { nodes: prune(nodes, listSections), chapters };
}

function withoutFrontMatter(markdown: string) {
  const text = markdown.replace(/\r\n?/g, '\n');
  const match = /^---\n[\s\S]*?\n(?:---|\.\.\.)[ \t]*(?:\n|$)/.exec(text);
  return match ? text.slice(match[0].length) : text;
}

const unescape = (text: string) => text.replace(/\\(.)/g, '$1');

function prune(nodes: BookNode[], listSections: WeakSet<BookNode>): BookNode[] {
  return nodes.filter((node) => {
    if (node.kind === 'divider') return true;
    node.children = prune(node.children, listSections);
    return !listSections.has(node) || node.children.some(child => child.kind !== 'divider');
  });
}
