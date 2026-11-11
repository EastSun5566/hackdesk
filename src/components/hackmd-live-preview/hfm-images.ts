import type { ImageBlock, ImageSize } from './hfm-types';

// HackMD's @hackmd/markdown-it-imsize grammar: `![alt](src "title" =WxH)`. The size comes after the
// title, needs a space before `=`, and the `x` is required (`=200x`, `=x90`, `=200x90`). Each side is
// `[0-9%]*`, so percentages work but units like `px` do not. Anything else is not an image on HackMD,
// so it is not one here either.
const markdownImagePattern = /^!\[((?:\\.|[^\\\]])*)\]\(\s*(<[^<>\r\n]+>|[^\s()]+(?:\([^\s()]*\)[^\s()]*)*)(?:\s+("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\((?:\\.|[^()\\])*\)))?(?:\s+=([0-9%]*)x([0-9%]*))?\s*\)$/;

const unsafeImageSourcePattern = /^(?:javascript|file|data|blob|vbscript):/i;

/**
 * Whether a source names a scheme no preview may load. Tested the way a URL parser reads it: tabs
 * and line breaks anywhere, and leading controls or spaces, do not count (`jav\tascript:` is
 * `javascript:`).
 */
function isUnsafeImageSource(src: string) {
  // oxlint-disable-next-line no-control-regex -- matching control characters is the point here
  const normalized = src.replace(/[\t\n\r]/g, '').replace(/^[\u0000-\u0020]+/, '');
  return unsafeImageSourcePattern.test(normalized);
}

export function parseMarkdownImage(lineText: string, lineTo: number): ImageBlock | null {
  const match = lineText.trim().match(markdownImagePattern);
  if (!match) {
    return null;
  }

  const [, rawAlt, destination, rawTitle, width, height] = match;
  const src = destination.startsWith('<') ? destination.slice(1, -1) : destination;
  if (!src || isUnsafeImageSource(src)) {
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

const htmlImagePattern = /^<img(\s+[^<>]*?)\s*\/?>$/i;
const htmlAttributePattern = /([^\s"'=<>/`]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

/**
 * A line holding only an `<img>` tag. HackMD's sanitizer keeps src, alt, title, width and height on
 * an image, so those are the attributes read here; everything else is dropped.
 */
export function parseHtmlImage(lineText: string, lineTo: number): ImageBlock | null {
  const match = lineText.trim().match(htmlImagePattern);
  if (!match) {
    return null;
  }

  const attributes = new Map<string, string>();
  for (const attribute of match[1].matchAll(htmlAttributePattern)) {
    attributes.set(attribute[1].toLowerCase(), decodeHtmlEntities(attribute[2] ?? attribute[3] ?? attribute[4] ?? ''));
  }

  const src = attributes.get('src')?.trim();
  if (!src || isUnsafeImageSource(src)) {
    return null;
  }

  return {
    alt: attributes.get('alt') ?? '',
    src,
    lineFrom: lineTo - lineText.length,
    lineTo,
    title: attributes.get('title') || undefined,
    width: parseImageSize(attributes.get('width')?.trim()),
    height: parseImageSize(attributes.get('height')?.trim()),
  };
}

/** A line that is a single image, in markdown or HTML. */
export function parseImageLine(lineText: string, lineTo: number): ImageBlock | null {
  return parseMarkdownImage(lineText, lineTo) ?? parseHtmlImage(lineText, lineTo);
}

function decodeHtmlEntities(text: string): string {
  return text.replace(/&(?:amp|lt|gt|quot|#39|#x27);/g, (entity) => ({
    '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&#x27;': "'",
  })[entity] ?? entity);
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
