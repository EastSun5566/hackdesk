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

type MathJaxApi = {
  adaptor: {
    outerHTML: (node: object) => string;
  };
  document: {
    convert: (source: string, options: { display: boolean }) => object;
  };
};

let mathJaxPromise: Promise<MathJaxApi> | null = null;
const mathCache = new Map<string, Promise<RenderedMath>>();
const mermaidCache = new Map<string, Promise<RenderedDiagram>>();

export function resolveEmojiShortcode(name: string): string | null {
  return nameToEmoji[name] ?? null;
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

  const promise = getMathJax()
    .then(async (mathJax) => {
      const node = mathJax.document.convert(source, { display: options.display });
      return {
        html: sanitizeRichHtml(mathJax.adaptor.outerHTML(node)),
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

async function getMathJax(): Promise<MathJaxApi> {
  if (!mathJaxPromise) {
    mathJaxPromise = loadMathJax();
  }

  return mathJaxPromise;
}

async function loadMathJax(): Promise<MathJaxApi> {
  const [
    mathjaxModule,
    texModule,
    svgModule,
    adaptorModule,
    handlerModule,
    packagesModule,
  ] = await Promise.all([
    import('mathjax-full/js/mathjax.js'),
    import('mathjax-full/js/input/tex.js'),
    import('mathjax-full/js/output/svg.js'),
    import('mathjax-full/js/adaptors/liteAdaptor.js'),
    import('mathjax-full/js/handlers/html.js'),
    import('mathjax-full/js/input/tex/AllPackages.js'),
  ]);

  const adaptor = adaptorModule.liteAdaptor();
  handlerModule.RegisterHTMLHandler(adaptor);
  const tex = new texModule.TeX({
    packages: packagesModule.AllPackages,
  });
  const svg = new svgModule.SVG({
    fontCache: 'none',
  });
  const document = mathjaxModule.mathjax.document('', {
    InputJax: tex,
    OutputJax: svg,
  });

  return {
    adaptor: adaptor as unknown as MathJaxApi['adaptor'],
    document,
  };
}

async function renderBeautifulMermaid(source: string): Promise<string> {
  const { renderMermaidSVG } = await import('beautiful-mermaid');
  return renderMermaidSVG(source, {
    accent: 'var(--primary-default)',
    bg: 'var(--background-default)',
    border: 'var(--border-default)',
    fg: 'var(--text-default)',
    line: 'var(--border-strong)',
    muted: 'var(--text-subtle)',
    surface: 'var(--background-muted)',
    transparent: true,
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
