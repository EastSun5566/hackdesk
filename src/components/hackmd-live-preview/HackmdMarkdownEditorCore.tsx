import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import '@fortawesome/fontawesome-free/css/all.css';
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { markdown, markdownKeymap, markdownLanguage } from '@codemirror/lang-markdown';
import { bracketMatching, foldKeymap, indentOnInput } from '@codemirror/language';
import { searchKeymap, highlightSelectionMatches, openSearchPanel, search } from '@codemirror/search';
import { EditorState, type Extension } from '@codemirror/state';
import {
  crosshairCursor,
  drawSelection,
  dropCursor,
  EditorView,
  highlightActiveLine,
  keymap,
  rectangularSelection,
} from '@codemirror/view';

import { hackmdCodeLanguages } from './hackmd-code-languages';
import { hfmBlocks } from './hfm-blocks';
import { hackmdTables } from './hackmd-tables';
import { hackmdInlinePreview } from './inline-preview';
import { hackmdPreviewTheme } from './hackmd-preview-theme';
import { createHackdeskSearchPanel } from './hackmd-search-panel';
import { hackmdRichPreviewNavigation } from './rich-preview-navigation';
import { hackmdRichPreviewWidgets } from './rich-preview-widgets';
import { treeProgressPlugin } from './tree-progress';

export type HackmdMarkdownEditorHandle = {
  focus: () => void;
  getContentDOM: () => HTMLElement | null;
  getMarkdown: () => string;
  insertText: (text: string) => void;
  openSearch: () => void;
};

export type HackmdMarkdownEditorProps = {
  value: string;
  onChange: (value: string) => void;
};

const editorExtensions: Extension[] = [
  history(),
  drawSelection(),
  dropCursor(),
  indentOnInput(),
  bracketMatching(),
  closeBrackets(),
  rectangularSelection(),
  crosshairCursor(),
  highlightActiveLine(),
  highlightSelectionMatches(),
  search({
    top: true,
    createPanel: createHackdeskSearchPanel,
  }),
  markdown({
    base: markdownLanguage,
    codeLanguages: hackmdCodeLanguages,
  }),
  markdownLanguage.data.of({
    closeBrackets: { brackets: ['(', '[', '{', "'", '"', '*', '_', '`'] },
  }),
  treeProgressPlugin,
  hackmdInlinePreview(),
  hackmdRichPreviewNavigation(),
  hackmdRichPreviewWidgets(),
  hfmBlocks(),
  hackmdTables(),
  EditorView.lineWrapping,
  keymap.of([
    indentWithTab,
    ...closeBracketsKeymap,
    ...historyKeymap,
    ...searchKeymap,
    ...markdownKeymap,
    ...defaultKeymap,
    ...foldKeymap,
  ]),
  ...hackmdPreviewTheme,
];

export const HackmdMarkdownEditorCore = forwardRef<HackmdMarkdownEditorHandle, HackmdMarkdownEditorProps>(
  function HackmdMarkdownEditorCore({
    value,
    onChange,
  }, ref) {
    const parentRef = useRef<HTMLDivElement | null>(null);
    const viewRef = useRef<EditorView | null>(null);
    const onChangeRef = useRef(onChange);
    const initialValueRef = useRef(value);

    useEffect(() => {
      onChangeRef.current = onChange;
    }, [onChange]);

    useImperativeHandle(ref, () => ({
      focus() {
        viewRef.current?.focus();
      },
      getContentDOM() {
        return viewRef.current?.contentDOM ?? null;
      },
      getMarkdown() {
        return viewRef.current?.state.doc.toString() ?? initialValueRef.current;
      },
      insertText(text: string) {
        const view = viewRef.current;

        if (!view) {
          onChangeRef.current(`${initialValueRef.current}${text}`);
          return;
        }

        const selection = view.state.selection.main;
        view.dispatch({
          changes: { from: selection.from, to: selection.to, insert: text },
          selection: { anchor: selection.from + text.length },
        });
        view.focus();
      },
      openSearch() {
        const view = viewRef.current;
        if (!view) {
          return;
        }

        openSearchPanel(view);
      },
    }), []);

    useEffect(() => {
      const parent = parentRef.current;
      if (!parent) {
        return undefined;
      }

      const view = new EditorView({
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

      return () => {
        view.destroy();
        viewRef.current = null;
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

    return (
      <div
        ref={parentRef}
        className="markdown-editor hackmd-markdown-editor min-h-0 flex-1 overflow-hidden"
        data-testid="hackmd-markdown-editor"
      />
    );
  },
);
