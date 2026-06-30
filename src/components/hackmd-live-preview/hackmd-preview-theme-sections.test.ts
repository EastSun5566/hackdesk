import { describe, expect, it } from 'vitest';

import { widgetTheme } from './hackmd-preview-theme-sections';

describe('HackMD preview widget theme', () => {
  it('keeps rich block widget spacing inside the measured border box', () => {
    expect(widgetTheme['.cm-hackmd-table']).not.toHaveProperty('margin');
    expect(widgetTheme['.cm-hackmd-image-preview']).not.toHaveProperty('margin');
    expect(widgetTheme['.cm-hackmd-rich-block']).not.toHaveProperty('margin');

    expect(widgetTheme['.cm-hackmd-table']).toHaveProperty('padding');
    expect(widgetTheme['.cm-hackmd-image-preview']).toHaveProperty('padding');
    expect(widgetTheme['.cm-hackmd-rich-block']).toHaveProperty('padding');
  });

  it('reserves a stable pending shell for async rich previews', () => {
    expect(widgetTheme['.cm-hackmd-rich-render-pending']).toMatchObject({
      minHeight: '7rem',
      fontFamily: 'var(--font-sans)',
    });
    expect(widgetTheme['.cm-hackmd-rich-math-inline-pending']).toMatchObject({
      minWidth: '2.5rem',
      fontFamily: 'var(--font-sans)',
    });
    expect(widgetTheme['.cm-hackmd-rich-icon-pending']).toMatchObject({
      width: '1.25em',
      fontFamily: 'var(--font-sans)',
    });
  });
});
