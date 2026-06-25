import {
  alertLinePattern,
  blockquoteMetadataLinePattern,
  containerLinePattern,
  tableDelimiterPattern,
} from './hfm-patterns';
import type { HfmBlockRange } from './hfm-types';

export function getHfmBlockRanges(lines: readonly string[]): HfmBlockRange[] {
  const ranges: HfmBlockRange[] = [];
  ranges.push(...getTableBlockRanges(lines));
  ranges.push(...getBlockquoteMetadataBlockRanges(lines));

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

      for (let closingIndex = index + 1; closingIndex < lines.length; closingIndex += 1) {
        const closingLine = lines[closingIndex] ?? '';
        const closingStart = closingLine.search(/:::/);
        if (closingStart < 0 || !/^:::\s*$/.test(closingLine.slice(closingStart))) {
          continue;
        }

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

    ranges.push({
      endLine,
      kind: 'alert',
      openerFrom: markerRange.from,
      openerLine: lineNumber,
      openerTo: markerRange.to,
      startLine: lineNumber,
      variant: alertMatch[1].toLowerCase(),
    });
  }

  return ranges;
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

export function getBlockquoteMetadataRange(text: string): { from: number; to: number } | null {
  const from = text.indexOf('[');
  if (from < 0) {
    return null;
  }

  return {
    from,
    to: text.trimEnd().length,
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

function getBlockquoteMetadataBlockRanges(lines: readonly string[]): HfmBlockRange[] {
  const ranges: HfmBlockRange[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    if (!blockquoteMetadataLinePattern.test(line.trim())) {
      continue;
    }

    let endIndex = index;
    for (let nextIndex = index + 1; nextIndex < lines.length; nextIndex += 1) {
      const nextLine = lines[nextIndex] ?? '';
      if (!/^\s*>/.test(nextLine)) {
        break;
      }
      endIndex = nextIndex;
    }

    ranges.push({
      endLine: endIndex + 1,
      kind: 'blockquote-meta',
      openerFrom: getBlockquoteMetadataRange(line)?.from ?? 0,
      openerLine: index + 1,
      openerTo: getBlockquoteMetadataRange(line)?.to ?? line.trimEnd().length,
      startLine: index + 1,
      variant: 'meta',
    });

    index = endIndex;
  }

  return ranges;
}

function isTableContentLine(line: string) {
  const trimmed = line.trim();
  return trimmed.startsWith('|') && trimmed.includes('|', 1) && trimmed !== '|';
}
