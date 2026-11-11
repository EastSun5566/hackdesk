import { getBlockquoteMetadataRange } from './hfm-block-ranges';
import {
  blockquoteMetadataLinePattern,
  fenceOpenPattern,
} from './hfm-patterns';
import type {
  HfmHiddenRange,
  HfmInlineMark,
} from './hfm-types';
import { getInlineHtmlDecorations } from './inline-html';

// HackMD's delimited inline marks (markdown-it-mark, -ins, -sub, -sup). Sub and sup content has no
// unescaped whitespace, and a single `~` must not be half of a `~~strikethrough~~`.
const delimitedMarks = [
  { pattern: /==(?!=)([^=\n]+?)==/g, className: 'cm-hackmd-mark', delimiter: 2 },
  { pattern: /\+\+(?!\+)([^+\n]+?)\+\+/g, className: 'cm-hackmd-insert', delimiter: 2 },
  { pattern: /(?<![~\\])~(?!~)((?:\\.|[^~\s\\])+)~(?!~)/g, className: 'cm-hackmd-subscript', delimiter: 1 },
  { pattern: /(?<![[\\])\^(?![[^])((?:\\.|[^^\s\\])+)\^/g, className: 'cm-hackmd-superscript', delimiter: 1 },
] as const;

export function getHackmdInlineMarks(text: string): HfmInlineMark[] {
  const codeSpans = getCodeSpans(text);
  return [
    ...getFenceMetadataMarks(text),
    ...getContainerMetadataMarks(text),
    ...delimitedMarks.flatMap(({ pattern, className }) => getRegexMarks(text, pattern, className, codeSpans)),
    ...getRegexMarks(text, /\{[^{}\n|]+\|[^{}\n|]+\}/g, 'cm-hackmd-ruby'),
    ...getRegexMarks(text, /\[\^[-\w]+\]/g, 'cm-hackmd-footnote-ref'),
    ...getRegexMarks(text, /^\s*\[\^[-\w]+\]:/g, 'cm-hackmd-footnote-def'),
    ...getRegexMarks(text, /^\*\[[^\]\n]+\]:/g, 'cm-hackmd-abbr-def'),
    ...getRegexMarks(text, /^\s*\[[^\]\n]+\]:\s+\S.+$/g, 'cm-hackmd-reference-def'),
    ...getRegexMarks(text, /!?\[[^\]\n]+\]\[[^\]\n]*\]/g, 'cm-hackmd-reference-link'),
    ...getRegexMarks(text, /(?<!\\)\$(?!\s|\$)(?:\\.|[^\n$\\])+(?<!\s|\$)\$/g, 'cm-hackmd-inline-math'),
    ...getRegexMarks(text, /\^\[[^\]\n]+\]/g, 'cm-hackmd-inline-footnote'),
    ...getRegexMarks(text, /\bhttps?:\/\/[^\s<]+/g, 'cm-hackmd-autolink'),
    ...getRegexMarks(text, /<\/?[A-Za-z][^>\n]*>/g, 'cm-hackmd-raw-html', codeSpans),
    ...getInlineHtmlDecorations(text, codeSpans).marks,
    ...getRegexMarks(text, /:[A-Za-z0-9_+-]+:/g, 'cm-hackmd-emoji'),
    ...getRegexMarks(text, /^\s*:\s+.+$/g, 'cm-hackmd-definition-line'),
    ...getRegexMarks(text, /^\s*~\s+.+$/g, 'cm-hackmd-definition-line'),
  ];
}

export function getHackmdHiddenRanges(text: string): HfmHiddenRange[] {
  const ranges: HfmHiddenRange[] = [];
  const blockquoteMetadata = getBlockquoteMetadataRange(text);
  if (blockquoteMetadata && blockquoteMetadataLinePattern.test(text.trim())) {
    ranges.push(blockquoteMetadata);
  }

  // Like `**` and `~~`, the delimiters of HackMD's own marks hide away from the cursor.
  const codeSpans = getCodeSpans(text);
  for (const { pattern, className, delimiter } of delimitedMarks) {
    for (const mark of getRegexMarks(text, pattern, className, codeSpans)) {
      ranges.push({ from: mark.from, to: mark.from + delimiter }, { from: mark.to - delimiter, to: mark.to });
    }
  }

  ranges.push(...getInlineHtmlDecorations(text, codeSpans).hidden);

  return ranges.sort((left, right) => left.from - right.from);
}

/** Inline code spans, whose contents are literal: no HackMD mark starts inside one. */
function getCodeSpans(text: string): HfmHiddenRange[] {
  const spans: HfmHiddenRange[] = [];
  for (const match of text.matchAll(/(`+)(?!`)[\s\S]*?(?<!`)\1(?!`)/g)) {
    if (match.index !== undefined) spans.push({ from: match.index, to: match.index + match[0].length });
  }
  return spans;
}

function getFenceMetadataMarks(text: string): HfmInlineMark[] {
  const match = text.match(fenceOpenPattern);
  if (!match || !match[2]) {
    return [];
  }

  const languageEnd = (match[1]?.length ?? 0) + text.slice(match[1]?.length ?? 0).search(match[2]) + match[2].length;
  const to = text.trimEnd().length;
  if (to <= languageEnd) {
    return [];
  }

  return [
    {
      className: 'cm-hackmd-fence-meta',
      from: languageEnd,
      to,
    },
  ];
}

function getContainerMetadataMarks(text: string): HfmInlineMark[] {
  const match = text.match(/^:::\s*(info|success|warning|danger|spoiler)\b(.*)$/i);
  if (!match) {
    return [];
  }

  const variantIndex = text.toLowerCase().indexOf(match[1].toLowerCase());
  const variantEnd = variantIndex + match[1].length;
  const to = text.trimEnd().length;
  if (to <= variantEnd) {
    return [];
  }

  return [
    {
      className: 'cm-hackmd-container-meta',
      from: variantEnd,
      to,
    },
  ];
}

function getRegexMarks(text: string, pattern: RegExp, className: string, skipped: readonly HfmHiddenRange[] = []): HfmInlineMark[] {
  const marks: HfmInlineMark[] = [];
  for (const match of text.matchAll(pattern)) {
    if (match.index === undefined || match[0].length === 0) {
      continue;
    }
    const index = match.index;
    if (skipped.some((range) => index < range.to && index + match[0].length > range.from)) {
      continue;
    }

    marks.push({
      className,
      from: match.index,
      to: match.index + match[0].length,
    });
  }
  return marks;
}
