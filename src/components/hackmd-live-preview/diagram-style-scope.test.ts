import { describe, expect, it } from 'vitest';

import { scopeDiagramCss, scopeDiagramStyles } from './diagram-style-scope';

describe('scopeDiagramCss', () => {
  it('scopes every selector to the diagram root and drops remote imports', () => {
    const css = `
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400&amp;display=swap');
      @import "https://example.com/other.css";
      text { font-family: 'var(--font-sans)', system-ui, sans-serif; }
      .mono, svg .label { font-family: monospace; }
      svg { /* derived */ --_line: var(--line); }
      svg.dark > g { opacity: 1; }
    `;

    expect(scopeDiagramCss(css, 'd1').split('\n')).toEqual([
      ".d1 text { font-family: 'var(--font-sans)', system-ui, sans-serif; }",
      '.d1 .mono, .d1 .label { font-family: monospace; }',
      '.d1 {  --_line: var(--line); }',
      '.d1.dark > g { opacity: 1; }',
    ]);
  });

  it('drops a stylesheet it cannot scope safely', () => {
    expect(scopeDiagramCss('@media (min-width: 1px) { text { color: red; } }', 'd1')).toBe('');
    expect(scopeDiagramCss('@font-face { font-family: X; src: url(x.woff); }', 'd1')).toBe('');
    expect(scopeDiagramCss(':is(text, g) { color: red; } text { color: blue; }', 'd1')).toBe('.d1 text { color: blue; }');
  });
});

describe('scopeDiagramStyles', () => {
  it('gives each diagram its own scope', () => {
    const svg = '<svg viewBox="0 0 1 1"><style>svg { --_text: red; } text { fill: red; }</style><text>A</text></svg>';
    const first = new DOMParser().parseFromString(scopeDiagramStyles(svg), 'text/html').querySelector('svg')!;
    const second = new DOMParser().parseFromString(scopeDiagramStyles(svg), 'text/html').querySelector('svg')!;
    const scope = (root: Element) => [...root.classList].find((name) => name.startsWith('cm-hackmd-diagram-'));

    expect(scope(first)).toBeDefined();
    expect(scope(first)).not.toBe(scope(second));
    expect(first.querySelector('style')?.textContent).toBe(`.${scope(first)} { --_text: red; }\n.${scope(first)} text { fill: red; }`);
  });

  it('removes styles when there is no single root svg to scope them to', () => {
    const html = scopeDiagramStyles('<style>text { fill: red; }</style><svg><text>A</text></svg>');
    expect(html).not.toContain('<style');
    expect(html).toContain('<text>A</text>');
  });
});
