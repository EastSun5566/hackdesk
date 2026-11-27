import { readFileSync } from 'node:fs';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

  it('renders Mermaid SVG that takes its colors and font from the --pele-* theme variables', async () => {
    const result = await renderMermaid(['graph TD', 'A --> B'].join('\n'));
    const svg = new DOMParser().parseFromString(result.html, 'text/html').querySelector('svg')!;
    const style = svg.getAttribute('style') ?? '';

    expect(svg.classList).toContain('pele-flowchart');
    for (const name of ['--pele-bg', '--pele-fg', '--pele-line', '--pele-border', '--pele-font']) {
      expect(style).toContain(`var(${name}`);
    }
  });

  // HackMD renders these with mermaid.js; the previous renderer rejected them.
  it.each([
    ['pie', ['pie title Pets', '"Dogs" : 3', '"Cats" : 2']],
    ['gantt', ['gantt', 'dateFormat YYYY-MM-DD', 'section A', 'Task :a1, 2026-01-01, 3d']],
    ['gitGraph', ['gitGraph', 'commit', 'branch dev', 'commit', 'checkout main', 'merge dev']],
    ['mindmap', ['mindmap', '  root', '    A', '    B']],
    ['journey', ['journey', 'title Day', 'section Work', 'Code: 5: Me']],
  ])('renders a %s diagram', async (_type, lines) => {
    const result = await renderMermaid(lines.join('\n'));

    expect(new DOMParser().parseFromString(result.html, 'text/html').querySelector('svg')?.getAttribute('aria-roledescription')).toBeTruthy();
  });

  it('rejects invalid Mermaid with the parser message and position', async () => {
    await expect(renderMermaid(['graph TD', 'A -->'].join('\n'))).rejects.toThrow(/line 2/);
  });

  it('drops click links, as Mermaid does at its strict security level', async () => {
    const result = await renderMermaid(['graph TD', 'A --> B', 'click A "https://example.com"'].join('\n'));

    expect(result.html).not.toContain('example.com');
  });

  describe('math in labels', () => {
    // jsdom has no layout, and pele drops math with an empty box; the measurer lays math out at 100px.
    beforeEach(() => {
      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 250, 150));
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    function mathBoxes(html: string) {
      const boxes = [...new DOMParser().parseFromString(html, 'text/html').querySelectorAll('svg .pele-math')];
      for (const box of boxes) expect(box.localName).toBe('foreignObject');
      return boxes;
    }

    it('renders $$…$$ in a flowchart label as KaTeX inside the diagram', async () => {
      const result = await renderMermaid(['graph TD', 'A["area $$x^2$$"] --> B'].join('\n'));
      const [box] = mathBoxes(result.html);

      expect(box).toBeDefined();
      expect(box.querySelector('.katex .katex-html')).not.toBeNull();
      expect(box.querySelector('.katex-mathml, math')).toBeNull();
      expect(result.html).not.toContain('$$');
    });

    it('sizes each math box from its measured KaTeX box, scaled to the label font size', async () => {
      const result = await renderMermaid(['graph TD', 'A["$$\\frac{a}{b}$$"] --> B'].join('\n'));
      const [box] = mathBoxes(result.html);

      // 2.5em × 1.5em at pele's 16px label size.
      expect(box.getAttribute('width')).toBe('40');
      expect(box.getAttribute('height')).toBe('24');
    });

    it('renders math with trust off, so TeX cannot add links', async () => {
      const result = await renderMermaid(['graph TD', 'A["$$\\href{javascript:alert(1)}{x}$$"] --> B'].join('\n'));

      expect(mathBoxes(result.html)).toHaveLength(1);
      expect(result.html).not.toContain('javascript:');
      expect(result.html).not.toMatch(/<a\b/);
    });

    it('shows invalid TeX as written, in KaTeX error style', async () => {
      const result = await renderMermaid(['graph TD', 'A["$$\\notACommand{$$"] --> B'].join('\n'));
      const [box] = mathBoxes(result.html);

      expect(box.querySelector('.katex-error')?.textContent).toBe('\\notACommand{');
    });

    it('keeps display style for valid TeX whose text mentions the error class', async () => {
      const result = await renderMermaid(['graph TD', 'A["$$\\sum_i \\text{katex-error}$$"] --> B'].join('\n'));
      const [box] = mathBoxes(result.html);

      expect(box.querySelector('.katex-error')).toBeNull();
      expect(box.querySelector('.mop.large-op')).not.toBeNull();
    });

    it('keeps the label as text when the math cannot be measured', async () => {
      vi.mocked(HTMLElement.prototype.getBoundingClientRect).mockReturnValue(new DOMRect(0, 0, 0, 0));
      const result = await renderMermaid(['graph TD', 'A["$$y_0$$"] --> B'].join('\n'));

      expect(mathBoxes(result.html)).toHaveLength(0);
      expect(result.html).toContain('$$y_0$$');
    });
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
