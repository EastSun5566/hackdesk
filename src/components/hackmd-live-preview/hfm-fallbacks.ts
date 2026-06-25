import {
  externalEmbedLabels,
  externalEmbedPattern,
  fenceOpenPattern,
  hfmFenceLabels,
  hfmFenceLanguages,
} from './hfm-patterns';
import type { FallbackBlock } from './hfm-types';

export function getFenceFallback(lineText: string, lineTo: number): FallbackBlock | null {
  const match = lineText.match(fenceOpenPattern);
  if (!match) {
    return null;
  }

  const lang = (match[2] ?? '').toLowerCase();
  if (hfmFenceLanguages.has(lang)) {
    return {
      lineTo,
      title: hfmFenceLabels[lang] ?? `${lang} block`,
      description: lang === 'csvpreview'
        ? 'Recognized HackMD CSV preview syntax. Rendering stays in raw markdown for now.'
        : 'Recognized HackMD rich block syntax. The editor keeps it editable as source.',
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
    const provider = external[1].toLowerCase();
    return {
      lineTo,
      title: externalEmbedLabels[provider] ?? `${provider} embed`,
      description: 'Recognized HackMD external embed syntax. It is not rendered inside the editor.',
    };
  }

  return null;
}
