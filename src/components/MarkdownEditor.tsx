import { useEffect, useRef } from 'react';
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import {
  bracketMatching,
  foldGutter,
  foldKeymap,
  indentOnInput,
} from '@codemirror/language';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { EditorState } from '@codemirror/state';
import {
  crosshairCursor,
  drawSelection,
  dropCursor,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
  rectangularSelection,
} from '@codemirror/view';

const editorTheme = EditorView.theme({
  '&': {
    height: '100%',
    backgroundColor: 'var(--background-default)',
    color: 'var(--text-default)',
    fontSize: '13px',
  },
  '.cm-scroller': {
    fontFamily: 'var(--font-editor)',
    lineHeight: '1.7',
  },
  '.cm-content': {
    padding: '18px 20px',
    caretColor: 'var(--primary-default)',
  },
  '.cm-line': {
    padding: '0 4px',
  },
  '.cm-gutters': {
    backgroundColor: 'var(--background-default)',
    color: 'var(--text-subtle)',
    borderRight: '1px solid var(--border-default)',
  },
  '.cm-activeLine': {
    backgroundColor: 'color-mix(in oklch, var(--background-selected) 55%, transparent)',
  },
  '.cm-activeLineGutter': {
    backgroundColor: 'var(--background-selected)',
    color: 'var(--text-default)',
  },
  '&.cm-focused': {
    outline: 'none',
  },
  '&.cm-focused .cm-cursor': {
    borderLeftColor: 'var(--primary-default)',
  },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': {
    backgroundColor: 'color-mix(in oklch, var(--primary-default) 22%, transparent)',
  },
}, { dark: true });

const editorExtensions = [
  lineNumbers(),
  highlightActiveLineGutter(),
  history(),
  foldGutter(),
  drawSelection(),
  dropCursor(),
  indentOnInput(),
  bracketMatching(),
  closeBrackets(),
  rectangularSelection(),
  crosshairCursor(),
  highlightActiveLine(),
  highlightSelectionMatches(),
  markdown(),
  EditorView.lineWrapping,
  keymap.of([
    indentWithTab,
    ...closeBracketsKeymap,
    ...defaultKeymap,
    ...searchKeymap,
    ...historyKeymap,
    ...foldKeymap,
  ]),
  editorTheme,
];

export function MarkdownEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const parentRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const initialValueRef = useRef(value);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!parentRef.current) {
      return undefined;
    }

    const view = new EditorView({
      parent: parentRef.current,
      state: EditorState.create({
        doc: initialValueRef.current,
        extensions: [
          ...editorExtensions,
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              onChangeRef.current(update.state.doc.toString());
            }
          }),
        ],
      }),
    });

    viewRef.current = view;

    return () => {
      view.destroy();
      if (viewRef.current === view) {
        viewRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const view = viewRef.current;

    if (!view) {
      return;
    }

    const currentValue = view.state.doc.toString();
    if (value !== currentValue) {
      view.dispatch({
        changes: { from: 0, to: currentValue.length, insert: value },
      });
    }
  }, [value]);

  return <div ref={parentRef} className="markdown-editor min-h-0 flex-1 overflow-hidden" />;
}
