import type { HfmHiddenRange, HfmInlineMark } from './hfm-types';

/**
 * Inline HTML in a note, shown the way HackMD shows it: the formatting tags its sanitizer allows
 * render as formatting, and their tags hide away from the cursor like `**`. Nothing here creates
 * HTML from the note; the result is decoration ranges, and the only attributes carried over are a
 * colour or background colour from `style` and an abbreviation's `title`.
 */

/** Paired tags that format their contents, with the class that styles them. */
const formattingTags: Record<string, string> = {
  abbr: 'cm-hackmd-html-abbr',
  b: 'cm-hackmd-strong',
  del: 'cm-hackmd-strike',
  em: 'cm-hackmd-em',
  i: 'cm-hackmd-em',
  ins: 'cm-hackmd-insert',
  kbd: 'cm-hackmd-html-kbd',
  mark: 'cm-hackmd-mark',
  q: 'cm-hackmd-html-q',
  s: 'cm-hackmd-strike',
  small: 'cm-hackmd-html-small',
  span: 'cm-hackmd-html-span',
  strike: 'cm-hackmd-strike',
  strong: 'cm-hackmd-strong',
  sub: 'cm-hackmd-subscript',
  summary: 'cm-hackmd-html-summary',
  sup: 'cm-hackmd-superscript',
  u: 'cm-hackmd-html-u',
};

/** Tags that only structure the note; on a line of their own they hide like other syntax. */
const structuralTags = new Set(['details', 'div', 'p', 'center']);

const tagPattern = /<(\/?)([a-zA-Z][\w-]*)((?:\s+[^\s"'=<>/`]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*(\/?)>/g;
const attributePattern = /([^\s"'=<>/`]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
const safeColorPattern = /^(?:#[0-9a-f]{3,8}|[a-z]{3,20}|(?:rgb|hsl)a?\(\s*[\d.]+(?:deg|%)?(?:\s*[,\s/]\s*[\d.]+%?){2,3}\s*\))$/i;

export type InlineHtmlDecorations = {
  hidden: HfmHiddenRange[];
  marks: HfmInlineMark[];
};

type OpenTag = { attributes: string; contentFrom: number; from: number; name: string };

export function getInlineHtmlDecorations(text: string, skipped: readonly HfmHiddenRange[] = []): InlineHtmlDecorations {
  const hidden: HfmHiddenRange[] = [];
  const marks: HfmInlineMark[] = [];
  const open: OpenTag[] = [];

  for (const match of text.matchAll(tagPattern)) {
    const from = match.index;
    if (from === undefined) continue;
    const to = from + match[0].length;
    if (skipped.some((range) => from < range.to && to > range.from)) continue;

    const [, closing, rawName, attributes, selfClosing] = match;
    const name = rawName.toLowerCase();

    if (name === 'br' && !closing) {
      hidden.push({ from, to, widget: 'line-break' });
      continue;
    }

    if (structuralTags.has(name) && text.trim() === match[0]) {
      hidden.push({ from, to });
      continue;
    }

    if (!(name in formattingTags) || selfClosing) continue;

    if (!closing) {
      open.push({ attributes, contentFrom: to, from, name });
      continue;
    }

    // Close the innermost matching tag; anything opened inside it and left open stays source.
    let index = open.length - 1;
    while (index >= 0 && open[index].name !== name) index -= 1;
    if (index < 0) continue;
    const [tag] = open.splice(index);
    if (tag.contentFrom >= from) continue;

    const mark: HfmInlineMark = { className: formattingTags[name], from: tag.contentFrom, to: from };
    const markAttributes = getSafeAttributes(name, tag.attributes);
    if (markAttributes) mark.attributes = markAttributes;
    marks.push(mark);
    hidden.push(
      name === 'summary' ? { from: tag.from, to: tag.contentFrom, widget: 'disclosure' } : { from: tag.from, to: tag.contentFrom },
      { from, to },
    );
  }

  return {
    hidden: hidden.sort((left, right) => left.from - right.from),
    marks,
  };
}

function getSafeAttributes(tagName: string, source: string): Record<string, string> | undefined {
  const attributes = parseAttributes(source);
  const safe: Record<string, string> = {};

  const style = getSafeStyle(attributes.get('style') ?? '');
  if (style) safe.style = style;
  if (tagName === 'abbr' && attributes.get('title')) safe.title = attributes.get('title')!;

  return Object.keys(safe).length > 0 ? safe : undefined;
}

function parseAttributes(source: string): Map<string, string> {
  const attributes = new Map<string, string>();
  for (const match of source.matchAll(attributePattern)) {
    attributes.set(match[1].toLowerCase(), match[2] ?? match[3] ?? match[4] ?? '');
  }
  return attributes;
}

/** Only text and background colour survive from inline styles, and only plain colour values. */
export function getSafeStyle(style: string): string {
  const declarations: string[] = [];
  for (const declaration of style.split(';')) {
    const separator = declaration.indexOf(':');
    if (separator < 0) continue;
    const property = declaration.slice(0, separator).trim().toLowerCase();
    const value = declaration.slice(separator + 1).trim();
    if ((property === 'color' || property === 'background-color' || property === 'background') && safeColorPattern.test(value)) {
      declarations.push(`${property === 'background' ? 'background-color' : property}: ${value}`);
    }
  }
  return declarations.join('; ');
}
