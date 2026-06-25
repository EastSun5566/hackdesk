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
});
