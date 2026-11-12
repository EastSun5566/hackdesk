import { syntaxHighlighting } from '@codemirror/language';
import type { Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import type { ResolvedThemeMode } from '@/lib/themes';

import {
  BLOCK_SURFACES,
  CODE_PANEL_BACKGROUNDS,
  CONTAINER_TINTS,
  codeAndBlockTheme,
  editorChromeTheme,
  inlineMarksTheme,
  proseTheme,
  searchPanelTheme,
  widgetTheme,
} from './hackmd-preview-theme-sections';
import { hackmdMarkdownHighlightStyle } from './hackmd-syntax';

const previewThemeCache = new Map<ResolvedThemeMode, Extension[]>();

export function createHackmdPreviewTheme(mode: ResolvedThemeMode): Extension[] {
  const cachedTheme = previewThemeCache.get(mode);
  if (cachedTheme) {
    return cachedTheme;
  }

  const theme = [
    syntaxHighlighting(hackmdMarkdownHighlightStyle),
    EditorView.theme({
      '&': {
        '--cm-block-surface': BLOCK_SURFACES[mode],
        '--cm-code-panel': CODE_PANEL_BACKGROUNDS[mode],
        '--cm-tint-info': CONTAINER_TINTS[mode].info,
        '--cm-tint-success': CONTAINER_TINTS[mode].success,
        '--cm-tint-warning': CONTAINER_TINTS[mode].warning,
        '--cm-tint-danger': CONTAINER_TINTS[mode].danger,
      },
    }),
    EditorView.theme({
      ...editorChromeTheme,
      ...searchPanelTheme,
      ...proseTheme,
      ...codeAndBlockTheme,
      ...inlineMarksTheme,
      ...widgetTheme,
    }, { dark: mode === 'dark' }),
  ];

  previewThemeCache.set(mode, theme);
  return theme;
}
