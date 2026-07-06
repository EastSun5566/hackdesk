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
  it('keeps UI chrome and editor content font sizes on separate semantic tokens', () => {
    expect(editorChromeTheme['&']).toHaveProperty('fontSize', 'var(--font-size-ui)');
    expect(editorChromeTheme['.cm-scroller']).toHaveProperty('fontSize', 'var(--font-size-editor)');
    expect(searchPanelTheme['.cm-panel.cm-vim-panel, .cm-panel.cm-hx-status-panel, .cm-panel.cm-hx-command-panel, .cm-panel.cm-kakoune-status-panel'])
      .toHaveProperty('fontSize', '11px');
  });

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

    expect(serializedTheme).not.toMatch(/--(?:border-strong|background-hover|text-muted|hackmd-alert)/);
    expect(serializedTheme).not.toMatch(/#[\da-f]{3,8}/i);
    expect(serializedTheme).not.toMatch(/\bblack\b/i);
  });

  it('uses the semantic focus ring token for editor focus affordances', () => {
    const serializedTheme = JSON.stringify(editorThemeSections);

    expect(serializedTheme).toContain('var(--focus-ring)');
  });

  it('styles transient reveal highlights with semantic tokens', () => {
    expect(searchPanelTheme['.cm-hackmd-initial-reveal-match']).toMatchObject({
      backgroundColor: 'color-mix(in oklch, var(--primary-default) 34%, transparent)',
    });
    expect(searchPanelTheme['.cm-hackmd-initial-reveal-match'].boxShadow)
      .toContain('var(--focus-ring)');
  });

  it('uses low-noise external link affordances for editor and table links', () => {
    expect(inlineMarksTheme['.cm-hackmd-link-open'])
      .toHaveProperty('cursor', 'pointer');
    expect(inlineMarksTheme['.cm-hackmd-link-open']).toMatchObject({
      color: 'var(--icon-subtle)',
      fontSize: '0.95em',
    });
    expect(inlineMarksTheme['.cm-hackmd-link-open::before']).toMatchObject({
      content: '"↗"',
    });
    expect(inlineMarksTheme['.cm-hackmd-link-open:hover'])
      .toHaveProperty('color', 'var(--link-text-default)');
  });

  it('uses fixed list marker alcoves for stable hanging indents', () => {
    expect(inlineMarksTheme['.cm-hackmd-list-marker']).toMatchObject({
      display: 'inline-block',
      width: '0.9em',
      marginRight: '0.3em',
      textAlign: 'right',
    });
    expect(inlineMarksTheme['.cm-hackmd-ordered-list-marker']).toMatchObject({
      textAlign: 'right',
    });
    expect(inlineMarksTheme['.cm-hackmd-task-checkbox']).toMatchObject({
      width: '0.9em',
      margin: '0 0.3em 0 0',
    });
  });

  it('keeps code blocks highlighted without selection-like token backgrounds', () => {
    expect(codeAndBlockTheme['.cm-hackmd-fenced-code']).toMatchObject({
      backgroundColor: 'color-mix(in oklch, var(--background-muted) 92%, var(--text-default) 8%)',
      boxShadow: 'inset 2px 0 0 color-mix(in oklch, var(--border-bold) 82%, var(--primary-default) 18%)',
    });
    expect(codeAndBlockTheme['.cm-hackmd-fenced-code'].boxShadow)
      .not.toContain('inset 0 1px');
    expect(codeAndBlockTheme['.cm-hackmd-fenced-code'].backgroundColor)
      .not.toContain('var(--background-selected)');
    expect(inlineMarksTheme['.cm-hackmd-inline-code']).toHaveProperty('backgroundColor', 'var(--primary-soft)');
  });

  it('styles table cell inline markdown without selection-like backgrounds', () => {
    expect(widgetTheme['.cm-hackmd-table-cell-mark']).toMatchObject({
      position: 'absolute',
      clipPath: 'inset(50%)',
    });
    expect(widgetTheme['.cm-hackmd-table-cell-strong']).toHaveProperty('fontWeight', '700');
    expect(widgetTheme['.cm-hackmd-table-cell-em']).toHaveProperty('fontStyle', 'italic');
    expect(widgetTheme['.cm-hackmd-table-cell-inline-code']).toHaveProperty('backgroundColor', 'var(--primary-soft)');
    expect(widgetTheme['.cm-hackmd-table-cell-link']).toHaveProperty('color', 'var(--link-text-default)');
    expect(JSON.stringify(widgetTheme['.cm-hackmd-table-cell-link'])).not.toContain('var(--background-selected)');
  });
});
