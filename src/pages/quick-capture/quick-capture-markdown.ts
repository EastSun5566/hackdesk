import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { markdown, markdownKeymap, markdownLanguage } from '@codemirror/lang-markdown';
import { syntaxHighlighting } from '@codemirror/language';
import { EditorSelection, Prec, type EditorState, type Extension, type StateCommand } from '@codemirror/state';
import { drawSelection, EditorView, keymap, placeholder } from '@codemirror/view';

import { resolveCodeLanguage } from '@/components/hackmd-live-preview/hackmd-code-languages';
import { EDITOR_SELECTION_BACKGROUND } from '@/components/hackmd-live-preview/hackmd-preview-theme-sections';
import { hackmdMarkdownHighlightStyle } from '@/components/hackmd-live-preview/hackmd-syntax';

function isWrappedOutside(state: EditorState, from: number, to: number, marker: string) {
  if (from < marker.length || to + marker.length > state.doc.length) return false;
  if (state.sliceDoc(from - marker.length, from) !== marker || state.sliceDoc(to, to + marker.length) !== marker) {
    return false;
  }
  // `*` next to `**` is the edge of bold text, not italic markers.
  const before = state.sliceDoc(from - marker.length - 1, from - marker.length);
  const after = state.sliceDoc(to + marker.length, to + marker.length + 1);
  return before !== marker[0] && after !== marker[0];
}

/**
 * Wraps each selection in `marker` (or removes it when the selection is already wrapped). An empty
 * selection gets a pair of markers with the cursor between them.
 */
export function toggleMarkdownWrap(marker: string): StateCommand {
  return ({ state, dispatch }) => {
    if (state.readOnly) return false;
    const transaction = state.changeByRange((range) => {
      const { from, to } = range;
      if (isWrappedOutside(state, from, to, marker)) {
        return {
          changes: [
            { from: from - marker.length, to: from },
            { from: to, to: to + marker.length },
          ],
          range: EditorSelection.range(from - marker.length, to - marker.length),
        };
      }

      const text = state.sliceDoc(from, to);
      if (!range.empty && text.length >= marker.length * 2 && text.startsWith(marker) && text.endsWith(marker)) {
        return {
          changes: { from, to, insert: text.slice(marker.length, text.length - marker.length) },
          range: EditorSelection.range(from, to - marker.length * 2),
        };
      }

      return {
        changes: [{ from, insert: marker }, { from: to, insert: marker }],
        range: EditorSelection.range(from + marker.length, to + marker.length),
      };
    });
    dispatch(state.update(transaction, { scrollIntoView: true, userEvent: 'input' }));
    return true;
  };
}

const quickCaptureTheme = EditorView.theme({
  '&': {
    height: '100%',
    backgroundColor: 'transparent',
    color: 'var(--text-default)',
  },
  '&.cm-focused': {
    outline: 'none',
  },
  '.cm-scroller': {
    fontFamily: 'var(--font-editor)',
    fontSize: '0.875rem',
    lineHeight: '1.5rem',
    overflow: 'auto',
  },
  '.cm-content': {
    padding: '16px 20px',
    caretColor: 'var(--primary-default)',
  },
  '.cm-line': {
    padding: '0',
    overflowWrap: 'anywhere',
  },
  '&.cm-focused .cm-cursor': {
    borderLeftColor: 'var(--primary-default)',
  },
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionLayer .cm-selectionBackground': {
    backgroundColor: EDITOR_SELECTION_BACKGROUND,
  },
  '.cm-content ::selection, .cm-content::selection': {
    color: 'currentcolor',
  },
  '.cm-placeholder': {
    color: 'var(--text-subtle)',
  },
});

type QuickCaptureMarkdownOptions = {
  placeholderText: string;
  onSubmit: () => void;
};

/**
 * The Quick Hack editor: Markdown highlighted with the note editor's colours, list and quote
 * continuation on Enter, and bold/italic shortcuts. Syntax stays visible; the note editor renders
 * the draft once it is in the workbench.
 */
export function quickCaptureMarkdownExtensions({ placeholderText, onSubmit }: QuickCaptureMarkdownOptions): Extension[] {
  return [
    history(),
    drawSelection(),
    EditorView.lineWrapping,
    markdown({ base: markdownLanguage, codeLanguages: resolveCodeLanguage }),
    syntaxHighlighting(hackmdMarkdownHighlightStyle),
    quickCaptureTheme,
    placeholder(placeholderText),
    Prec.highest(keymap.of([
      {
        key: 'Mod-Enter',
        run: () => {
          onSubmit();
          return true;
        },
      },
      { key: 'Mod-b', run: toggleMarkdownWrap('**') },
      { key: 'Mod-i', run: toggleMarkdownWrap('*') },
    ])),
    keymap.of([
      ...markdownKeymap,
      ...historyKeymap,
      indentWithTab,
      ...defaultKeymap,
    ]),
  ];
}
