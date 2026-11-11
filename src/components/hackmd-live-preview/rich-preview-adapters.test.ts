import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { renderMath, renderMermaid, withWoff2FontFace } from './rich-preview-adapters';

describe('rich-preview-adapters', () => {
  it('renders inline math with KaTeX markup', async () => {
    const result = await renderMath('x^2 + y^2 = z^2', { display: false });

    expect(result.html).toContain('class="katex"');
    expect(result.html).toContain('x');
    expect(result.html).not.toContain('cm-hackmd-math-fallback');
  });

  it('renders display math with KaTeX display markup', async () => {
    const result = await renderMath('\\frac{1}{x}', { display: true });

    expect(result.html).toContain('class="katex-display"');
    expect(result.html).toContain('class="katex"');
    expect(result.html).not.toContain('cm-hackmd-math-fallback');
  });

  it('keeps invalid TeX renderable without throwing', async () => {
    const result = await renderMath('\\definitelyNotAKatexCommand{', { display: false });

    expect(result.html).toContain('class="katex-error"');
    expect(result.html).toContain('\\definitelyNotAKatexCommand{');
    expect(result.html).not.toContain('<script');
  });

  it('renders Mermaid SVG with the HackDesk font token', async () => {
    const result = await renderMermaid(['graph TD', 'A --> B'].join('\n'));

    expect(result.html).toContain("font-family: 'var(--font-sans)'");
    expect(result.html).toContain('var(--border-bold)');
    expect(result.html).not.toContain('var(--border-strong)');
    expect(result.html).not.toContain("font-family: 'Inter'");
  });

  it('keeps Mermaid styles inside each rendered diagram', async () => {
    const results = await Promise.all([
      renderMermaid(['graph TD', 'A --> B'].join('\n')),
      renderMermaid(['erDiagram', 'A ||--o{ B : has'].join('\n')),
    ]);
    const scopes = results.map(({ html }) => {
      const root = new DOMParser().parseFromString(html, 'text/html').body.firstElementChild!;
      const scope = [...root.classList].find((name) => name.startsWith('cm-hackmd-diagram-'))!;
      const css = [...root.querySelectorAll('style')].map((style) => style.textContent).join('\n');

      expect(root.localName).toBe('svg');
      expect(css).not.toContain('@import');
      // Every rule starts with this diagram's own scope.
      for (const [, selectors] of css.matchAll(/([^{}]+)\{[^{}]*\}/g)) {
        for (const selector of selectors.split(',')) expect(selector.trim()).toMatch(new RegExp(`^\\.${scope}(?![\\w-])`));
      }
      return scope;
    });

    expect(new Set(scopes).size).toBe(2);
  });
});

describe('withWoff2FontFace', () => {
  it('replaces Font Awesome 4.7 font sources with the bundled woff2 only', () => {
    const css = readFileSync(`${process.cwd()}/node_modules/font-awesome/css/font-awesome.css`, 'utf8');
    const result = withWoff2FontFace(css, '/assets/fontawesome-webfont.woff2');

    expect(result).toContain("src: url(\"/assets/fontawesome-webfont.woff2\") format('woff2')");
    expect(result).not.toMatch(/\.(?:eot|ttf|svg|woff)\?v=4\.7\.0/);
    // The icon names HackMD notes use are all there.
    for (const name of ['fa-pencil', 'fa-file-text-o', 'fa-github', 'fa-fw']) {
      expect(result).toContain(`.${name}`);
    }
  });
});
