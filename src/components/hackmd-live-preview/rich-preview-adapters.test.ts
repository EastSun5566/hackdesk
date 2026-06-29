import { describe, expect, it } from 'vitest';

import { renderMath, renderMermaid } from './rich-preview-adapters';

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
    expect(result.html).not.toContain("font-family: 'Inter'");
  });
});
