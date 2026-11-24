import {
  alertLinePattern,
  containerLinePattern,
  tableDelimiterPattern,
} from './hfm-patterns';
import type { HfmBlockRange } from './hfm-types';

export function getHfmBlockRanges(lines: readonly string[]): HfmBlockRange[] {
  const ranges: HfmBlockRange[] = [];
  ranges.push(...getTableBlockRanges(lines));

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    const lineNumber = index + 1;
    const containerMatch = line.match(containerLinePattern);

    if (containerMatch) {
      const variant = containerMatch[1].toLowerCase();
      let endLine = lineNumber;
      let closerLine: number | undefined;
      let closerFrom: number | undefined;
      let closerTo: number | undefined;

      // A closer is a `:::` line of its own, not text that ends in `:::`. Without one the container
      // runs to the end of the note, as on hackmd.io.
      endLine = lines.length;
      for (let closingIndex = index + 1; closingIndex < lines.length; closingIndex += 1) {
        const closingLine = lines[closingIndex] ?? '';
        if (!/^ {0,3}:{3,}\s*$/.test(closingLine)) {
          continue;
        }
        const closingStart = closingLine.indexOf(':');

        endLine = closingIndex + 1;
        closerLine = endLine;
        closerFrom = closingStart;
        closerTo = closingLine.trimEnd().length;
        break;
      }

      ranges.push({
        endLine,
        kind: 'container',
        openerFrom: line.search(/:::/),
        openerLine: lineNumber,
        openerTo: line.trimEnd().length,
        startLine: lineNumber,
        variant,
        closerFrom,
        closerLine,
        closerTo,
      });
      continue;
    }

    const alertMatch = line.match(alertLinePattern);
    if (!alertMatch) {
      continue;
    }

    const markerRange = getAlertMarkerRange(line);
    if (!markerRange) {
      continue;
    }

    let endLine = lineNumber;
    for (let nextIndex = index + 1; nextIndex < lines.length; nextIndex += 1) {
      const nextLine = lines[nextIndex] ?? '';
      if (!/^\s*>/.test(nextLine)) {
        break;
      }

      endLine = nextIndex + 1;
    }

    const titleTo = line.trimEnd().length;
    const titleFrom = titleTo - line.slice(markerRange.to, titleTo).trimStart().length;
    ranges.push({
      endLine,
      kind: 'alert',
      openerFrom: markerRange.from,
      openerLine: lineNumber,
      openerTo: markerRange.to,
      startLine: lineNumber,
      variant: alertMatch[1].toLowerCase(),
      ...(titleTo > titleFrom ? { titleFrom, titleTo } : {}),
    });
  }

  return ranges;
}

export type SpoilerOpener = {
  /** `{state="open"}` and other attributes: the first `{…}` after `spoiler`, which is not summary text. */
  params?: { from: number; to: number };
  open: boolean;
  /** The summary hackmd.io shows on the collapsed section, without its attributes. */
  summary?: { from: number; to: number };
  /** Where the summary may start: just after `spoiler`. */
  keywordTo: number;
};

/** Reads a `:::spoiler Summary {state="open"}` opener line; null for any other line. */
export function parseSpoilerOpener(text: string): SpoilerOpener | null {
  const match = /^( {0,3}:::\s*spoiler)(?=\s|$)/.exec(text);
  if (!match) return null;
  const keywordTo = match[1]!.length;
  const rest = text.slice(keywordTo);
  const paramsMatch = /\{[^}]*\}/.exec(rest);
  const params = paramsMatch ? { from: keywordTo + paramsMatch.index, to: keywordTo + paramsMatch.index + paramsMatch[0].length } : undefined;
  const open = Boolean(paramsMatch && /(?:^|[\s{])state\s*=\s*(["']?)open\1(?=[\s}])/i.test(paramsMatch[0]));
  // The summary is what is left on either side of the attributes; it is shown from its first word to its last.
  const trimmedEnd = text.trimEnd().length;
  const before = params ? text.slice(keywordTo, params.from) : text.slice(keywordTo, trimmedEnd);
  const after = params ? text.slice(params.to, trimmedEnd) : '';
  let summary: SpoilerOpener['summary'];
  if (before.trim() || after.trim()) {
    const from = before.trim()
      ? keywordTo + before.length - before.trimStart().length
      : params!.to + after.length - after.trimStart().length;
    summary = { from, to: after.trim() ? trimmedEnd : keywordTo + before.trimEnd().length };
  }
  return { keywordTo, open, params, summary };
}

export function getAlertMarkerRange(text: string): { from: number; to: number } | null {
  const markerStart = text.indexOf('[!');
  const markerText = text.slice(markerStart).match(/^\[![^\]]+\]/)?.[0];
  if (markerStart < 0 || !markerText) {
    return null;
  }

  return {
    from: markerStart,
    to: markerStart + markerText.length,
  };
}

function getTableBlockRanges(lines: readonly string[]): HfmBlockRange[] {
  const ranges: HfmBlockRange[] = [];

  for (let index = 1; index < lines.length; index += 1) {
    const delimiter = lines[index] ?? '';
    if (!tableDelimiterPattern.test(delimiter)) {
      continue;
    }

    const headerLine = lines[index - 1] ?? '';
    if (!isTableContentLine(headerLine)) {
      continue;
    }

    let startIndex = index - 1;
    while (startIndex > 0 && isTableContentLine(lines[startIndex - 1] ?? '')) {
      startIndex -= 1;
    }

    let endIndex = index;
    while (endIndex + 1 < lines.length && isTableContentLine(lines[endIndex + 1] ?? '')) {
      endIndex += 1;
    }

    ranges.push({
      endLine: endIndex + 1,
      kind: 'table',
      openerFrom: 0,
      openerLine: startIndex + 1,
      openerTo: headerLine.length,
      startLine: startIndex + 1,
      variant: 'table',
    });

    index = endIndex;
  }

  return ranges;
}

function isTableContentLine(line: string) {
  const trimmed = line.trim();
  return trimmed.startsWith('|') && trimmed.includes('|', 1) && trimmed !== '|';
}
