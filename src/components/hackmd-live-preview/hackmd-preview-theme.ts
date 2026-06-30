import { syntaxHighlighting } from '@codemirror/language';
import type { Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import type { ResolvedThemeMode } from '@/lib/themes';

import {
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
