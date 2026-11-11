import { describe, expect, it } from 'vitest';

import { HACKDESK_THEME_PRESETS, resolveHackDeskTheme, type ResolvedThemeMode } from '@/lib/themes';

import {
  CODE_PANEL_BACKGROUNDS,
  codeAndBlockTheme,
  EDITOR_LINE_WIDTH,
  EDITOR_SELECTION_BACKGROUND,
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
  // `--cm-*` variables are per-line layout values set by decorations (like a code gutter's width),
  // not palette tokens.
  return new Set(Array.from(serializedTheme.matchAll(/var\((--(?!cm-)[\w-]+)/g), (match) => match[1]));
}

describe('HackMD preview widget theme', () => {
  it('paints editor selections as a translucent tint so the text keeps its color', () => {
    const selection = editorChromeTheme['&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionLayer .cm-selectionBackground'];
    expect(selection).toEqual({ backgroundColor: EDITOR_SELECTION_BACKGROUND });
    expect(editorChromeTheme['.cm-content ::selection, .cm-content::selection']).toEqual({ color: 'currentcolor' });
    expect(EDITOR_SELECTION_BACKGROUND).toBe('color-mix(in srgb, var(--primary-default) 24%, transparent)');
  });

  it('centers editor text in a readable column measured in the editor font', () => {
    // In em, so the measure follows the editor font size for a proportional or monospace face.
    expect(EDITOR_LINE_WIDTH).toMatch(/em$/);
    expect(editorChromeTheme['.cm-content']).toMatchObject({
      padding: '24px clamp(20px, 6%, 48px) 36vh',
      width: `min(100%, calc(${EDITOR_LINE_WIDTH} + 2 * clamp(20px, 6%, 48px)))`,
      maxWidth: `calc(${EDITOR_LINE_WIDTH} + 2 * clamp(20px, 6%, 48px))`,
      marginInline: 'auto',
      boxSizing: 'border-box',
    });
  });

  it('keeps UI chrome and editor content font sizes on separate semantic tokens', () => {
    expect(editorChromeTheme['&']).toHaveProperty('fontSize', 'var(--font-size-ui)');
    expect(editorChromeTheme['.cm-scroller']).toHaveProperty('fontSize', 'var(--font-size-editor)');
    expect(searchPanelTheme['.cm-panel.cm-vim-panel, .cm-panel.cm-hx-status-panel, .cm-panel.cm-hx-command-panel, .cm-panel.cm-kakoune-status-panel'])
      .toMatchObject({
        fontFamily: 'var(--font-mono)',
        minHeight: '32px',
      });
    expect(searchPanelTheme['.cm-hackdesk-search-input']).toMatchObject({
      fontFamily: 'var(--font-sans)',
      height: '32px',
    });
  });

  it('aligns editor chrome controls with shared component states', () => {
    expect(searchPanelTheme['.cm-hackdesk-search-input']).toMatchObject({
      border: '1px solid var(--border-default)',
      borderRadius: '6px',
      backgroundColor: 'var(--background-default)',
    });
    expect(searchPanelTheme['.cm-hackdesk-search-button']).toMatchObject({
      width: '32px',
      height: '32px',
      border: '1px solid var(--border-default)',
      borderRadius: '6px',
      backgroundColor: 'var(--background-default)',
    });
    expect(searchPanelTheme['.cm-hackdesk-search-button:hover']).toHaveProperty(
      'backgroundColor',
      'var(--element-bg-hover)',
    );
    expect(searchPanelTheme['.cm-hackdesk-search-button:active']).toHaveProperty(
      'backgroundColor',
      'var(--background-selected)',
    );
    expect(searchPanelTheme['.cm-hackdesk-search-button:focus-visible'].boxShadow)
      .toContain('var(--focus-ring)');
  });

  it('overrides modal editor inputs and popups with semantic surfaces', () => {
    expect(searchPanelTheme['.cm-hx-command-input']).toMatchObject({
      height: '32px',
      border: '1px solid var(--border-default)',
      borderRadius: '6px',
      backgroundColor: 'var(--background-default)',
    });
    expect(searchPanelTheme['.cm-panel.cm-vim-panel input']).toMatchObject({
      height: '32px',
      fontFamily: 'var(--font-mono)',
      backgroundColor: 'var(--background-default)',
    });
    expect(searchPanelTheme['.cm-hx-command-popup']).toMatchObject({
      border: '1px solid var(--border-default)',
      borderRadius: '6px',
      backgroundColor: 'var(--background-default)',
    });
    expect(searchPanelTheme['.cm-hx-command-help']).toMatchObject({
      borderBottom: '1px solid var(--border-default)',
      backgroundColor: 'var(--background-muted)',
    });
  });

  it('keeps rich block widget spacing inside the measured border box', () => {
    expect(widgetTheme['.cm-hackmd-table']).not.toHaveProperty('margin');
    // A <figure> has a browser default margin, so the image preview must zero it rather than omit it.
    expect(widgetTheme['.cm-hackmd-image-preview']).toHaveProperty('margin', '0');
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
    expect(codeAndBlockTheme['.cm-hackmd-alert-block-note, .cm-hackmd-alert-block-todo'].borderLeftColor)
      .toBe('var(--link-text-default)');
    expect(codeAndBlockTheme['.cm-hackmd-alert-block-tip'].borderLeftColor)
      .toBe('var(--success-default)');
    expect(codeAndBlockTheme['.cm-hackmd-alert-block-warning'].borderLeftColor)
      .toBe('var(--warning-default)');
    expect(codeAndBlockTheme['.cm-hackmd-alert-block-caution, .cm-hackmd-alert-block-danger'].borderLeftColor)
      .toBe('var(--destructive-default)');
    expect(inlineMarksTheme['.cm-hackmd-alert-heading-important'].color)
      .toBe('var(--primary-default)');
  });

  it('draws block edges with borders, never inset shadows on rounded lines', () => {
    // An inset box-shadow on a line with border-radius bleeds a hairline across each line edge.
    for (const [selector, style] of Object.entries(codeAndBlockTheme)) {
      if (!/alert-block|container-block|table-block|blockquote-meta/.test(selector)) continue;
      expect(style, selector).not.toHaveProperty('boxShadow');
    }
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
      backgroundColor: 'var(--cm-code-panel)',
      color: 'var(--text-default)',
    });
    // Light uses the theme's muted surface as is; mixing in text colour turned it a muddy grey.
    expect(CODE_PANEL_BACKGROUNDS.light).toBe('var(--background-muted)');
    expect(CODE_PANEL_BACKGROUNDS.dark).toContain('var(--background-muted)');
    // One flat panel: no accent stripe, whose per-line shadow shows a seam at every line edge.
    expect(codeAndBlockTheme['.cm-hackmd-fenced-code']).not.toHaveProperty('boxShadow');
    expect(codeAndBlockTheme['.cm-hackmd-indented-code']).not.toHaveProperty('boxShadow');
    expect(codeAndBlockTheme['.cm-hackmd-fenced-code:not(.cm-hackmd-code-footer, .cm-hackmd-code-last), .cm-hackmd-indented-code'].boxShadow)
      .not.toContain('inset');
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
