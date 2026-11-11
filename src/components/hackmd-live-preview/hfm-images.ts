import type { ImageBlock, ImageSize } from './hfm-types';

// HackMD's @hackmd/markdown-it-imsize grammar: `![alt](src "title" =WxH)`. The size comes after the
// title, needs a space before `=`, and the `x` is required (`=200x`, `=x90`, `=200x90`). Each side is
// `[0-9%]*`, so percentages work but units like `px` do not. Anything else is not an image on HackMD,
// so it is not one here either.
const markdownImagePattern = /^!\[((?:\\.|[^\\\]])*)\]\(\s*(<[^<>\r\n]+>|[^\s()]+(?:\([^\s()]*\)[^\s()]*)*)(?:\s+("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\((?:\\.|[^()\\])*\)))?(?:\s+=([0-9%]*)x([0-9%]*))?\s*\)$/;

const unsafeImageSourcePattern = /^(?:javascript|file|data|blob|vbscript):/i;

export function parseMarkdownImage(lineText: string, lineTo: number): ImageBlock | null {
  const match = lineText.trim().match(markdownImagePattern);
  if (!match) {
    return null;
  }

  const [, rawAlt, destination, rawTitle, width, height] = match;
  const src = destination.startsWith('<') ? destination.slice(1, -1) : destination;
  if (!src || unsafeImageSourcePattern.test(src)) {
    return null;
  }

  return {
    alt: unescapeMarkdown(rawAlt),
    src,
    lineFrom: lineTo - lineText.length,
    lineTo,
    title: rawTitle ? unescapeMarkdown(rawTitle.slice(1, -1)) : undefined,
    width: parseImageSize(width),
    height: parseImageSize(height),
  };
}

/** A HackMD size side: digits are pixels, a trailing `%` is a percentage of the column. */
export function parseImageSize(value: string | undefined): ImageSize | undefined {
  const match = value?.match(/^(\d+(?:\.\d+)?)(%|px)?$/);
  if (!match) {
    return undefined;
  }

  const amount = Number.parseFloat(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) {
    return undefined;
  }

  return { value: amount, unit: match[2] === '%' ? '%' : 'px' };
}

export function formatImageSize(size: ImageSize): string {
  return `${size.value}${size.unit}`;
}

// Alt text that only names the file or says "image" (what uploads insert) is not worth a caption.
const placeholderAltPattern = /^(?:image|img|picture|photo|screenshot|untitled|uploading image\b.*|inserting image\b.*)$|\.(?:png|jpe?g|gif|webp|svg|bmp|tiff?|heic|avif)$/i;

/** The caption shown under an image: its title, else alt text that says more than "image". */
export function getImageCaption(image: Pick<ImageBlock, 'alt' | 'title'>): string {
  const title = image.title?.trim();
  if (title) {
    return title;
  }

  const alt = image.alt.trim();
  return alt && !placeholderAltPattern.test(alt) ? alt : '';
}

function unescapeMarkdown(text: string): string {
  return text.replace(/\\([\\`*_{}[\]()#+\-.!"'|<>~])/g, '$1');
}
