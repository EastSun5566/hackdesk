import {
  alertLinePattern,
  blockquoteMetadataLinePattern,
  containerLinePattern,
  externalEmbedPattern,
  fenceOpenPattern,
  hfmFenceLanguages,
} from './hfm-patterns';
import type { HfmLineDecorations } from './hfm-types';
import {
  getHackmdHiddenRanges,
  getHackmdInlineMarks,
} from './hfm-inline-marks';

export function getHfmLineDecorations(text: string): HfmLineDecorations {
  const trimmed = text.trim();
  const lineClasses: string[] = [];
  const alertMatch = text.match(alertLinePattern);
  const containerMatch = text.match(containerLinePattern);
  const fenceMatch = text.match(fenceOpenPattern);
  const externalMatch = trimmed.match(externalEmbedPattern);

  if (alertMatch) {
    lineClasses.push(`cm-hackmd-alert cm-hackmd-alert-${alertMatch[1].toLowerCase()}`);
  }

  if (containerMatch) {
    lineClasses.push(`cm-hackmd-container cm-hackmd-container-${containerMatch[1].toLowerCase()}`);
  }

  if (/^#{6}\s+tags:/i.test(text)) {
    lineClasses.push('cm-hackmd-tags-line');
  }

  if (/^\[toc\]$/i.test(trimmed) || trimmed === '[[toc]]') {
    lineClasses.push('cm-hackmd-toc-line');
  }

  if (/^\[[^\]]+=[^\]]+\](?:\s+\[[^\]]+=[^\]]+\])*\s*$/.test(trimmed)) {
    lineClasses.push('cm-hackmd-blockquote-meta');
  }

  if (blockquoteMetadataLinePattern.test(trimmed)) {
    lineClasses.push('cm-hackmd-blockquote-meta');
  }

  if (/^\|.*\|$/.test(trimmed)) {
    lineClasses.push('cm-hackmd-table-line');
  }

  if (/^(?: {4}|\t)\S/.test(text)) {
    lineClasses.push('cm-hackmd-indented-code');
  }

  if (trimmed === '$$') {
    lineClasses.push('cm-hackmd-math-block-line');
  }

  if (externalMatch) {
    lineClasses.push(`cm-hackmd-external-line cm-hackmd-external-${externalMatch[1].toLowerCase()}`);
  }

  if (fenceMatch) {
    const lang = (fenceMatch[2] ?? '').toLowerCase();
    const meta = fenceMatch[3] ?? '';
    if (hfmFenceLanguages.has(lang)) {
      lineClasses.push(`cm-hackmd-hfm-fence cm-hackmd-hfm-fence-${lang}`);
    } else if (hasFenceOptions(meta) || /[=!]$/.test(lang)) {
      lineClasses.push('cm-hackmd-code-fence-options');
    }
  }

  return {
    lineClasses,
    inlineMarks: getHackmdInlineMarks(text),
    hiddenRanges: getHackmdHiddenRanges(text),
  };
}

function hasFenceOptions(value: string) {
  return value.includes('=') || value.includes('!') || value.includes('[');
}
