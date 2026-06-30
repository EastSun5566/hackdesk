import DOMPurify from 'dompurify';
import { nameToEmoji } from 'gemoji';
import Papa from 'papaparse';

export type CsvPreviewModel = {
  header: string[] | null;
  rows: string[][];
};

export type RenderedDiagram = {
  html: string;
};

export type RenderedMath = {
  html: string;
};

type KatexApi = typeof import('katex');

let katexPromise: Promise<KatexApi> | null = null;
let fontAwesomeCssPromise: Promise<unknown> | null = null;
const mathCache = new Map<string, Promise<RenderedMath>>();
const mermaidCache = new Map<string, Promise<RenderedDiagram>>();

export function resolveEmojiShortcode(name: string): string | null {
  return nameToEmoji[name] ?? null;
}

export function ensureFontAwesomeCss(): Promise<unknown> {
  if (!fontAwesomeCssPromise) {
    fontAwesomeCssPromise = import('@fortawesome/fontawesome-free/css/all.css');
  }

  return fontAwesomeCssPromise;
}

export function parseCsvPreview(source: string, options: { delimiter?: string; header?: boolean } = {}): CsvPreviewModel {
  const delimiter = options.delimiter && options.delimiter.length > 0 ? options.delimiter : ',';
  const parsed = Papa.parse<string[]>(source.trim(), {
    delimiter,
    skipEmptyLines: true,
  });

  const data = parsed.data
    .filter((row) => row.some((cell) => cell.trim().length > 0))
    .map((row) => row.map((cell) => cell.trim()));

  if (options.header && data.length > 0) {
    return {
      header: data[0] ?? [],
      rows: data.slice(1),
    };
  }

  return {
    header: null,
    rows: data,
  };
}

export async function renderMath(source: string, options: { display: boolean }): Promise<RenderedMath> {
  const cacheKey = `${options.display ? 'block' : 'inline'}:${source}`;
  const cached = mathCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const promise = getKatex()
    .then(async (katex) => {
      return {
        html: katex.renderToString(source, {
          displayMode: options.display,
          throwOnError: false,
          trust: false,
        }),
      };
    })
    .catch(() => ({
      html: `<span class="cm-hackmd-math-fallback">${escapeHtml(source)}</span>`,
    }));
  mathCache.set(cacheKey, promise);
  return promise;
}

export async function renderMermaid(source: string): Promise<RenderedDiagram> {
  const cacheKey = source;
  const cached = mermaidCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const promise = renderBeautifulMermaid(source)
    .then((html) => ({ html: sanitizeRichHtml(html) }));
  mermaidCache.set(cacheKey, promise);
  return promise;
}

function sanitizeRichHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true, svg: true, svgFilters: true },
  });
}

async function getKatex(): Promise<KatexApi> {
  if (!katexPromise) {
    katexPromise = Promise.all([
      import('katex'),
      import('katex/dist/katex.min.css'),
    ]).then(([katex]) => katex);
  }

  return katexPromise;
}

async function renderBeautifulMermaid(source: string): Promise<string> {
  const { renderMermaidSVG } = await import('beautiful-mermaid');
  return renderMermaidSVG(source, {
    accent: 'var(--primary-default)',
    bg: 'var(--background-default)',
    border: 'var(--border-default)',
    fg: 'var(--text-default)',
    line: 'var(--border-bold)',
    muted: 'var(--text-subtle)',
    surface: 'var(--background-muted)',
    transparent: true,
    font: 'var(--font-sans)',
  });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
