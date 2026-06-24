export type ImageBlock = {
  alt: string;
  height?: number;
  lineTo: number;
  src: string;
  width?: number;
};

export type FallbackBlock = {
  description: string;
  lineTo: number;
  title: string;
};

export type HfmInlineMark = {
  className: string;
  from: number;
  to: number;
};

export type HfmLineDecorations = {
  inlineMarks: HfmInlineMark[];
  lineClasses: string[];
};

export const hfmFenceLanguages = new Set([
  'csvpreview',
  'sequence',
  'flow',
  'graphviz',
  'mermaid',
  'abc',
  'plantuml',
  'vega',
  'fretboard',
]);

const externalEmbedPattern = /^\{%(youtube|vimeo|gist|slideshare|speakerdeck|pdf|figma)\s+(.+?)\s*%\}$/i;

export function parseMarkdownImage(lineText: string, lineTo: number): ImageBlock | null {
  const match = lineText.trim().match(/^!\[([^\]]*)\]\((\S+?)(?:\s+=([0-9]+)?x?([0-9]+)?)?(?:\s+["'][^)]*["'])?\)$/);
  if (!match) {
    return null;
  }

  const [, alt, src, width, height] = match;
  if (!src || /^(?:javascript|file|data|blob):/i.test(src)) {
    return null;
  }

  return {
    alt,
    src,
    lineTo,
    width: width ? Number.parseInt(width, 10) : undefined,
    height: height ? Number.parseInt(height, 10) : undefined,
  };
}

export function getFenceFallback(lineText: string, lineTo: number): FallbackBlock | null {
  const match = lineText.match(/^(```|~~~)\s*([A-Za-z0-9_-]+)(.*)$/);
  if (!match) {
    return null;
  }

  const lang = match[2].toLowerCase();
  if (lang === 'csvpreview') {
    return {
      lineTo,
      title: 'CSV preview block',
      description: 'Recognized HackMD CSV preview syntax. Rendering stays in raw markdown for now.',
    };
  }

  if (hfmFenceLanguages.has(lang) && lang !== 'csvpreview') {
    return {
      lineTo,
      title: `${lang} diagram block`,
      description: 'Recognized HackMD diagram syntax. The editor keeps it editable as source.',
    };
  }

  return null;
}

export function getLineFallback(lineText: string, lineTo: number): FallbackBlock | null {
  const trimmed = lineText.trim();

  if (trimmed === '$$') {
    return {
      lineTo,
      title: 'MathJax block',
      description: 'Recognized HackMD block math. Rendering stays as editable LaTeX source.',
    };
  }

  const external = trimmed.match(externalEmbedPattern);
  if (external) {
    return {
      lineTo,
      title: `${external[1].toLowerCase()} embed`,
      description: 'Recognized HackMD external embed syntax. It is not rendered inside the editor.',
    };
  }

  return null;
}

export function getHfmLineDecorations(text: string): HfmLineDecorations {
  const trimmed = text.trim();
  const lineClasses: string[] = [];
  const calloutMatch = text.match(/^>\s*\[!(note|tip|important|warning|caution|danger|todo)\]/i);
  const containerMatch = text.match(/^:::\s*(info|success|warning|danger|spoiler)\b/i);
  const fenceMatch = text.match(/^(```|~~~)\s*([A-Za-z0-9_-]+)?(.*)$/);
  const externalMatch = trimmed.match(externalEmbedPattern);

  if (calloutMatch) {
    lineClasses.push(`cm-hackmd-callout cm-hackmd-callout-${calloutMatch[1].toLowerCase()}`);
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

  if (/^\|.*\|$/.test(trimmed) || /^:?\s*-{3,}/.test(trimmed)) {
    lineClasses.push('cm-hackmd-table-line');
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
  };
}

export function getCalloutMarkerRange(text: string): { from: number; to: number } | null {
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

function hasFenceOptions(value: string) {
  return value.includes('=') || value.includes('!') || value.includes('[');
}

function getHackmdInlineMarks(text: string): HfmInlineMark[] {
  return [
    ...getRegexMarks(text, /==([^=\n]+)==/g, 'cm-hackmd-mark'),
    ...getRegexMarks(text, /\+\+([^+\n]+)\+\+/g, 'cm-hackmd-insert'),
    ...getRegexMarks(text, /(?<!\w)~([^~\s][^~\n]*?)~/g, 'cm-hackmd-subscript'),
    ...getRegexMarks(text, /\^([^^\s][^^\n]*?)\^/g, 'cm-hackmd-superscript'),
    ...getRegexMarks(text, /\{[^{}\n|]+\|[^{}\n|]+\}/g, 'cm-hackmd-ruby'),
    ...getRegexMarks(text, /\[\^[-\w]+\]/g, 'cm-hackmd-footnote-ref'),
    ...getRegexMarks(text, /^\s*\[\^[-\w]+\]:/g, 'cm-hackmd-footnote-def'),
    ...getRegexMarks(text, /^\*\[[^\]\n]+\]:/g, 'cm-hackmd-abbr-def'),
    ...getRegexMarks(text, /:[A-Za-z0-9_+-]+:/g, 'cm-hackmd-emoji'),
    ...getRegexMarks(text, /^\s*:\s+.+$/g, 'cm-hackmd-definition-line'),
    ...getRegexMarks(text, /^\s*~\s+.+$/g, 'cm-hackmd-definition-line'),
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

