import { describe, expect, it } from 'vitest';

import { HACKDESK_THEME_PRESETS, resolveHackDeskTheme, type ResolvedThemeMode } from '@/lib/themes';

import {
  codeAndBlockTheme,
  editorChromeTheme,
  inlineMarksTheme,
  proseTheme,
  searchPanelTheme,
  widgetTheme,
} from './hackmd-preview-theme-sections';

const editorThemeSections = {
  ...editorChromeTheme,
  ...searchPanelTheme,
  ...proseTheme,
  ...codeAndBlockTheme,
  ...inlineMarksTheme,
  ...widgetTheme,
};

function getReferencedThemeTokens() {
  const serializedTheme = JSON.stringify(editorThemeSections);
  return new Set(Array.from(serializedTheme.matchAll(/var\((--[\w-]+)/g), (match) => match[1]));
}

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

  it('only references semantic variables resolved by every light and dark palette', () => {
    const referencedTokens = getReferencedThemeTokens();

    for (const preset of HACKDESK_THEME_PRESETS) {
      for (const mode of ['light', 'dark'] satisfies ResolvedThemeMode[]) {
        const resolvedTheme = resolveHackDeskTheme({ presetId: preset.id, mode });
        expect(
          [...referencedTokens].filter((token) => !(token in resolvedTheme)),
          `${preset.id} ${mode} is missing editor theme tokens`,
        ).toEqual([]);
      }
    }
  });

  it('uses semantic status tokens for alert blocks and headings', () => {
    expect(codeAndBlockTheme['.cm-hackmd-alert-block-note, .cm-hackmd-alert-block-todo'].boxShadow)
      .toContain('var(--link-text-default)');
    expect(codeAndBlockTheme['.cm-hackmd-alert-block-tip'].boxShadow)
      .toContain('var(--success-default)');
    expect(codeAndBlockTheme['.cm-hackmd-alert-block-warning'].boxShadow)
      .toContain('var(--warning-default)');
    expect(codeAndBlockTheme['.cm-hackmd-alert-block-caution, .cm-hackmd-alert-block-danger'].boxShadow)
      .toContain('var(--destructive-default)');
    expect(inlineMarksTheme['.cm-hackmd-alert-heading-important'].color)
      .toBe('var(--primary-default)');
  });

  it('does not retain obsolete aliases or fixed light and dark alert colors', () => {
    const serializedTheme = JSON.stringify(editorThemeSections);

    expect(serializedTheme).not.toMatch(/--(?:focus-ring|border-strong|background-hover|text-muted|hackmd-alert)/);
    expect(serializedTheme).not.toMatch(/#[\da-f]{3,8}/i);
    expect(serializedTheme).not.toMatch(/\bblack\b/i);
  });
});
