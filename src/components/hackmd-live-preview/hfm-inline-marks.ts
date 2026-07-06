import { getBlockquoteMetadataRange } from './hfm-block-ranges';
import {
  blockquoteMetadataLinePattern,
  fenceOpenPattern,
} from './hfm-patterns';
import type {
  HfmHiddenRange,
  HfmInlineMark,
} from './hfm-types';

export function getHackmdInlineMarks(text: string): HfmInlineMark[] {
  return [
    ...getFenceMetadataMarks(text),
    ...getContainerMetadataMarks(text),
    ...getRegexMarks(text, /==([^=\n]+)==/g, 'cm-hackmd-mark'),
    ...getRegexMarks(text, /\+\+([^+\n]+)\+\+/g, 'cm-hackmd-insert'),
    ...getRegexMarks(text, /(?<!\w)~([^~\s][^~\n]*?)~/g, 'cm-hackmd-subscript'),
    ...getRegexMarks(text, /\^([^^\s][^^\n]*?)\^/g, 'cm-hackmd-superscript'),
    ...getRegexMarks(text, /\{[^{}\n|]+\|[^{}\n|]+\}/g, 'cm-hackmd-ruby'),
    ...getRegexMarks(text, /\[\^[-\w]+\]/g, 'cm-hackmd-footnote-ref'),
    ...getRegexMarks(text, /^\s*\[\^[-\w]+\]:/g, 'cm-hackmd-footnote-def'),
    ...getRegexMarks(text, /^\*\[[^\]\n]+\]:/g, 'cm-hackmd-abbr-def'),
    ...getRegexMarks(text, /^\s*\[[^\]\n]+\]:\s+\S.+$/g, 'cm-hackmd-reference-def'),
    ...getRegexMarks(text, /!?\[[^\]\n]+\]\[[^\]\n]*\]/g, 'cm-hackmd-reference-link'),
    ...getRegexMarks(text, /(?<!\\)\$(?!\s|\$)(?:\\.|[^\n$\\])+(?<!\s|\$)\$/g, 'cm-hackmd-inline-math'),
    ...getRegexMarks(text, /\^\[[^\]\n]+\]/g, 'cm-hackmd-inline-footnote'),
    ...getRegexMarks(text, /\bhttps?:\/\/[^\s<]+/g, 'cm-hackmd-autolink'),
    ...getRegexMarks(text, /<\/?[A-Za-z][^>\n]*>/g, 'cm-hackmd-raw-html'),
    ...getRegexMarks(text, /\((?:c|r|tm|p)\)|\+-|\.{2,}|--|["'][^"'\n]+["']/gi, 'cm-hackmd-typographer'),
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

  return ranges;
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

function getRegexMarks(text: string, pattern: RegExp, className: string): HfmInlineMark[] {
  const marks: HfmInlineMark[] = [];
  for (const match of text.matchAll(pattern)) {
    if (match.index === undefined || match[0].length === 0) {
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
