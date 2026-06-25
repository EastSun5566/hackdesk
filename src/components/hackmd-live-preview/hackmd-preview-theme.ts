import { syntaxHighlighting } from '@codemirror/language';
import { EditorView } from '@codemirror/view';

import {
  codeAndBlockTheme,
  editorChromeTheme,
  inlineMarksTheme,
  proseTheme,
  searchPanelTheme,
  widgetTheme,
} from './hackmd-preview-theme-sections';
import { hackmdMarkdownHighlightStyle } from './hackmd-syntax';

export const hackmdPreviewTheme = [
  syntaxHighlighting(hackmdMarkdownHighlightStyle),
  EditorView.theme({
    ...editorChromeTheme,
    ...searchPanelTheme,
    ...proseTheme,
    ...codeAndBlockTheme,
    ...inlineMarksTheme,
    ...widgetTheme,
  }, { dark: true }),
];
