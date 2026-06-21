import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import {
  bracketMatching,
  foldGutter,
  foldKeymap,
  HighlightStyle,
  indentOnInput,
  syntaxHighlighting,
} from '@codemirror/language';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { tags } from '@lezer/highlight';

type EditorExtension = import('@codemirror/state').Extension;
type EditorViewInstance = InstanceType<typeof import('@codemirror/view').EditorView>;

const markdownHighlightStyle = HighlightStyle.define([
  {
    tag: tags.heading,
    color: 'var(--text-default)',
    fontWeight: '700',
  },
  {
    tag: tags.heading1,
    fontSize: '1.22em',
  },
  {
    tag: tags.heading2,
    fontSize: '1.12em',
  },
  {
    tag: tags.heading3,
    fontSize: '1.05em',
  },
  {
    tag: tags.strong,
    color: 'var(--text-default)',
    fontWeight: '700',
  },
  {
    tag: tags.emphasis,
    color: 'var(--text-default)',
    fontStyle: 'italic',
  },
  {
    tag: tags.strikethrough,
    textDecoration: 'line-through',
    textDecorationColor: 'var(--text-subtle)',
  },
  {
    tag: [tags.link, tags.url],
    color: 'var(--link-text-default)',
    textDecoration: 'underline',
    textDecorationColor: 'color-mix(in oklch, var(--link-text-default) 48%, transparent)',
  },
  {
    tag: tags.quote,
    color: 'var(--text-subtle)',
    fontStyle: 'italic',
  },
  {
    tag: tags.monospace,
    color: 'var(--primary-default)',
    backgroundColor: 'var(--primary-soft)',
  },
  {
    tag: tags.contentSeparator,
    color: 'var(--border-default)',
  },
  {
    tag: tags.list,
    color: 'var(--text-subtle)',
  },
  {
    tag: tags.meta,
    color: 'var(--text-subtle)',
  },
  {
    tag: tags.comment,
    color: 'var(--text-subtle)',
    fontStyle: 'italic',
  },
  {
    tag: [tags.keyword, tags.atom, tags.bool],
    color: 'var(--primary-default)',
  },
  {
    tag: [tags.string, tags.number],
    color: 'var(--success-default)',
  },
  {
    tag: [tags.variableName, tags.definition(tags.variableName), tags.propertyName],
    color: 'var(--text-default)',
  },
  {
    tag: tags.invalid,
    color: 'var(--destructive-default)',
  },
]);

let editorSetupPromise: Promise<{
  EditorState: typeof import('@codemirror/state').EditorState;
  EditorView: typeof import('@codemirror/view').EditorView;
  editorExtensions: EditorExtension[];
}> | null = null;

function loadEditorSetup() {
  editorSetupPromise ??= Promise.all([
    import('@codemirror/state'),
    import('@codemirror/view'),
  ]).then(([stateModule, viewModule]) => {
    const {
      crosshairCursor,
      drawSelection,
      dropCursor,
      EditorView,
      highlightActiveLine,
      highlightActiveLineGutter,
      keymap,
      lineNumbers,
      rectangularSelection,
    } = viewModule;
    const editorTheme = EditorView.theme({
      '&': {
        height: '100%',
        backgroundColor: 'var(--background-default)',
        color: 'var(--text-default)',
        fontSize: '14px',
      },
      '.cm-scroller': {
        fontFamily: 'var(--font-editor)',
        lineHeight: '1.75',
      },
      '.cm-content': {
        padding: '20px 24px',
        caretColor: 'var(--primary-default)',
      },
      '.cm-line': {
        padding: '0 4px',
      },
      '.cm-gutters': {
        backgroundColor: 'var(--background-muted)',
        color: 'var(--text-subtle)',
        borderRight: '1px solid var(--border-default)',
      },
      '.cm-gutterElement': {
        padding: '0 10px 0 8px',
      },
      '.cm-activeLine': {
        backgroundColor: 'color-mix(in oklch, var(--background-selected) 42%, transparent)',
      },
      '.cm-activeLineGutter': {
        backgroundColor: 'var(--background-selected)',
        color: 'var(--text-default)',
      },
      '.cm-foldGutter .cm-gutterElement': {
        color: 'var(--icon-subtle)',
      },
      '.cm-link, .cm-url': {
        color: 'var(--link-text-default)',
        textDecorationColor: 'color-mix(in oklch, var(--link-text-default) 42%, transparent)',
      },
      '.cm-matchingBracket': {
        backgroundColor: 'var(--primary-soft)',
        outline: '1px solid var(--primary-default)',
      },
      '&.cm-focused': {
        outline: 'none',
      },
      '&.cm-focused .cm-cursor': {
        borderLeftColor: 'var(--primary-default)',
      },
      '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': {
        backgroundColor: 'color-mix(in oklch, var(--primary-default) 28%, transparent)',
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
      syntaxHighlighting(markdownHighlightStyle),
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

    return {
      EditorState: stateModule.EditorState,
      EditorView,
      editorExtensions,
    };
  });

  return editorSetupPromise;
}

export type MarkdownEditorHandle = {
  insertText: (text: string) => void;
};

export type MarkdownEditorProps = {
  value: string;
  onChange: (value: string) => void;
};

export const MarkdownEditorCore = forwardRef<MarkdownEditorHandle, MarkdownEditorProps>(function MarkdownEditorCore({
  value,
  onChange,
}, ref) {
  const parentRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorViewInstance | null>(null);
  const onChangeRef = useRef(onChange);
  const initialValueRef = useRef(value);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useImperativeHandle(ref, () => ({
    insertText(text: string) {
      const view = viewRef.current;

      if (!view) {
        onChangeRef.current(`${initialValueRef.current}${text}`);
        return;
      }

      const selection = view.state.selection.main;
      const insertAt = selection.to;

      view.dispatch({
        changes: { from: selection.from, to: selection.to, insert: text },
        selection: { anchor: insertAt + text.length },
      });
      view.focus();
    },
  }), []);

  useEffect(() => {
    const parent = parentRef.current;
    let disposed = false;
    let view: EditorViewInstance | null = null;

    if (!parent) {
      return undefined;
    }

    void loadEditorSetup().then(({ EditorState, EditorView, editorExtensions }) => {
      if (disposed) {
        return;
      }

      view = new EditorView({
        parent,
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
    });

    return () => {
      disposed = true;
      view?.destroy();
    };
  }, []);

  useEffect(() => {
    const view = viewRef.current;

    if (!view) {
      initialValueRef.current = value;
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
});

export default MarkdownEditorCore;
