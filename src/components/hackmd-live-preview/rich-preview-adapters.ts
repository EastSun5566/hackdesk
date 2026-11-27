import DOMPurify from 'dompurify';
import { nameToEmoji } from 'gemoji';
import Papa from 'papaparse';

import type { MathResolver } from 'pele/lazy';

import { scopeDiagramStyles } from './diagram-style-scope';

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
const MAX_PREVIEW_CACHE_ENTRIES = 128;

function getCached<T>(cache: Map<string, T>, key: string) {
  const value = cache.get(key);
  if (value !== undefined) {
    cache.delete(key);
    cache.set(key, value);
  }
  return value;
}

function setCached<T>(cache: Map<string, T>, key: string, value: T) {
  cache.set(key, value);
  while (cache.size > MAX_PREVIEW_CACHE_ENTRIES) {
    cache.delete(cache.keys().next().value!);
  }
}

export function resolveEmojiShortcode(name: string): string | null {
  return nameToEmoji[name] ?? null;
}

/**
 * Loads Font Awesome 4.7, the version HackMD renders `<i class="fa fa-…">` icons with, so the same
 * icon names (fa-file-text-o, fa-github, …) work here. Its stylesheet lists five font formats;
 * Electron only needs woff2, so the @font-face is replaced to bundle just that file.
 */
export function ensureFontAwesomeCss(): Promise<unknown> {
  if (!fontAwesomeCssPromise) {
    fontAwesomeCssPromise = Promise.all([
      import('font-awesome/css/font-awesome.css?raw'),
      import('font-awesome/fonts/fontawesome-webfont.woff2?url'),
    ]).then(([css, font]) => {
      const style = document.createElement('style');
      style.dataset.hackdeskFontAwesome = '4.7.0';
      style.textContent = withWoff2FontFace(css.default, font.default);
      document.head.appendChild(style);
    });
  }

  return fontAwesomeCssPromise;
}

export function withWoff2FontFace(css: string, fontUrl: string): string {
  const fontFace = `@font-face {
  font-family: 'FontAwesome';
  src: url(${JSON.stringify(fontUrl)}) format('woff2');
  font-weight: normal;
  font-style: normal;
  font-display: block;
}`;
  return css.replace(/@font-face\s*{[^}]*}/, fontFace);
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
  const cached = getCached(mathCache, cacheKey);
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
  setCached(mathCache, cacheKey, promise);
  return promise;
}

export async function renderMermaid(source: string): Promise<RenderedDiagram> {
  const fonts = getDiagramFonts();
  // Label boxes are sized for the font, so a font change needs a new layout.
  const cacheKey = `${fonts.fontFamily}\n${fonts.fontFamilyMono}\n${source}`;
  const cached = getCached(mermaidCache, cacheKey);
  if (cached) {
    return cached;
  }

  const promise = renderPeleMermaid(source, fonts)
    .then(({ svg, hasMath }) => ({
      html: scopeDiagramStyles(hasMath ? sanitizeDiagramWithMath(svg) : sanitizeRichHtml(svg)),
    }))
    .catch((error) => {
      mermaidCache.delete(cacheKey);
      throw error;
    });
  setCached(mermaidCache, cacheKey, promise);
  return promise;
}

function sanitizeRichHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true, svg: true, svgFilters: true },
  });
}

/**
 * Pele draws resolved math as KaTeX HTML in a `<foreignObject class="pele-math">`. DOMPurify drops
 * foreignObject and any HTML inside SVG by default; this lets that one integration point through.
 * Its contents are still sanitized as HTML, and only diagrams whose labels held `$$…$$` get it.
 */
function sanitizeDiagramWithMath(html: string): string {
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true, svg: true, svgFilters: true },
    ADD_TAGS: ['foreignObject'],
    HTML_INTEGRATION_POINTS: { foreignobject: true },
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

let nextMermaidId = 0;

/**
 * The fonts as the page resolves them. Pele measures label widths with a canvas, which can't read
 * `var(--font-sans)`; colors and the drawn font still come from the `--pele-*` variables in the theme.
 */
function getDiagramFonts() {
  const style = getComputedStyle(document.documentElement);
  return {
    fontFamily: style.getPropertyValue('--font-sans').trim() || 'sans-serif',
    fontFamilyMono: style.getPropertyValue('--font-mono').trim() || 'monospace',
  };
}

async function renderPeleMermaid(
  source: string,
  fonts: ReturnType<typeof getDiagramFonts>,
): Promise<{ svg: string; hasMath: boolean }> {
  const [{ renderAsync }, katex] = await Promise.all([
    import('pele/lazy'),
    // Mermaid draws `$$…$$` in labels as math; only those diagrams load KaTeX.
    source.includes('$$') ? getKatex() : null,
  ]);
  let hasMath = false;
  let math: MathResolver | undefined;
  if (katex) {
    await warmDiagramMath(katex, source);
    math = (tex, size) => {
      hasMath = true;
      const { html, width, height } = getDiagramMath(katex, tex);
      return { html, width: Math.ceil(width * size), height: Math.ceil(height * size) };
    };
  }
  const { svg } = await renderAsync(source, {
    ...fonts,
    // Mermaid's default `strict` security level ignores `click` directives; a diagram never navigates the app.
    links: false,
    idPrefix: `cm-hackmd-mermaid-${++nextMermaidId}-`,
    math,
  });
  return { svg, hasMath };
}

type DiagramMath = { html: string; width: number; height: number };

const diagramMathCache = new Map<string, DiagramMath>();
// Matches pele's own `$$…$$` label syntax: one line, shortest match.
const DIAGRAM_MATH = /\$\$(.+?)\$\$/g;
const MEASURE_FONT_SIZE = 100;

function renderDiagramTex(katex: KatexApi, tex: string): string {
  // Mermaid renders label math in display style; `\displaystyle` keeps that without KaTeX's block margins.
  // HTML output only: DOMPurify's profiles here drop MathML, which would leave its text behind.
  const options = { output: 'html', throwOnError: false, trust: false } as const;
  const html = katex.renderToString(`\\displaystyle ${tex}`, options);
  // Invalid TeX shows its source in red; show what the note wrote, without the prefix. Match the
  // class attribute: label text such as `\text{katex-error}` renders as content, with quotes escaped.
  return /class="katex-error"/.test(html) ? katex.renderToString(tex, options) : html;
}

function createMathMeasurer(html: string): HTMLElement {
  const element = document.createElement('div');
  element.setAttribute('aria-hidden', 'true');
  // The same box pele puts the HTML in, at a large size so rounding stays small.
  element.style.cssText = `position:absolute;left:-10000px;top:0;visibility:hidden;display:inline-block;font-size:${MEASURE_FONT_SIZE}px;line-height:normal;white-space:nowrap`;
  element.innerHTML = html;
  return element;
}

function readMathSize(element: HTMLElement): { width: number; height: number } {
  const rect = element.getBoundingClientRect();
  // In ems of the label's font size, so one measurement serves every size pele asks for.
  return { width: rect.width / MEASURE_FONT_SIZE, height: rect.height / MEASURE_FONT_SIZE };
}

/**
 * Pele asks for math synchronously while it lays out, so the KaTeX fonts must be loaded before then
 * or the boxes would be measured with a fallback font. Laying the expressions out starts those loads.
 */
async function warmDiagramMath(katex: KatexApi, source: string) {
  const pending = [...new Set([...source.matchAll(DIAGRAM_MATH)].map(([, tex]) => tex))]
    .filter((tex) => getCached(diagramMathCache, tex) === undefined)
    .map((tex) => {
      // The HTML is KaTeX's output with `trust: false`, not note content.
      const html = renderDiagramTex(katex, tex);
      return { tex, html, element: createMathMeasurer(html) };
    });
  if (pending.length === 0) return;

  document.body.append(...pending.map(({ element }) => element));
  try {
    for (const { element } of pending) element.getBoundingClientRect();
    await document.fonts?.ready;
    for (const { tex, html, element } of pending) cacheDiagramMath(tex, { html, ...readMathSize(element) });
  } finally {
    for (const { element } of pending) element.remove();
  }
}

function cacheDiagramMath(tex: string, math: DiagramMath): DiagramMath {
  // An empty box (no layout yet) makes pele show the source; measure again next time.
  if (math.width > 0 && math.height > 0) setCached(diagramMathCache, tex, math);
  return math;
}

function getDiagramMath(katex: KatexApi, tex: string): DiagramMath {
  const cached = getCached(diagramMathCache, tex);
  if (cached) return cached;

  // A label whose `$$` the warm-up regex read differently from pele (quotes, entities).
  const html = renderDiagramTex(katex, tex);
  const element = createMathMeasurer(html);
  document.body.append(element);
  try {
    return cacheDiagramMath(tex, { html, ...readMathSize(element) });
  } finally {
    element.remove();
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
