import type { ImageBlock } from './hfm-types';

export function parseMarkdownImage(lineText: string, lineTo: number): ImageBlock | null {
  const match = lineText.trim().match(/^!\[([^\]]*)\]\((<[^<>\r\n]+>|\S+?)(?:\s+=([0-9]+)?x?([0-9]+)?)?(?:\s+["'][^)]*["'])?\)$/);
  if (!match) {
    return null;
  }

  const [, alt, destination, width, height] = match;
  const src = destination.startsWith('<') ? destination.slice(1, -1) : destination;
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
