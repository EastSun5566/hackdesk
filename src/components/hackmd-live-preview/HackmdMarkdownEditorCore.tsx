import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import type { DragEvent } from 'react';
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
import { inlineAttachmentExtension } from 'inline-attacher';

import { hackmdCodeLanguages } from './hackmd-code-languages';
import { hfmBlocks } from './hfm-blocks';
import { hackmdTables } from './hackmd-tables';
import { hackmdInlinePreview } from './inline-preview';
import { hackmdPreviewTheme } from './hackmd-preview-theme';
import { formatMarkdownImage } from './markdown-image';
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
  onAttachImage?: (file: File) => Promise<{ link: string }>;
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
    onAttachImage,
  }, ref) {
    const parentRef = useRef<HTMLDivElement | null>(null);
    const viewRef = useRef<EditorView | null>(null);
    const onAttachImageRef = useRef(onAttachImage);
    const onChangeRef = useRef(onChange);
    const initialValueRef = useRef(value);
    const pendingFocusRef = useRef(false);
    const dragDepthRef = useRef(0);
    const [isImageDragging, setIsImageDragging] = useState(false);

    useEffect(() => {
      onChangeRef.current = onChange;
    }, [onChange]);

    useEffect(() => {
      onAttachImageRef.current = onAttachImage;
    }, [onAttachImage]);

    useImperativeHandle(ref, () => ({
      focus() {
        const view = viewRef.current;
        if (!view) {
          pendingFocusRef.current = true;
          return;
        }

        view.focus();
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

    useLayoutEffect(() => {
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
            inlineAttachmentExtension({
              allowedTypes: ['image/jpeg', 'image/png', 'image/jpg', 'image/gif', 'image/webp'],
              errorText: '![Failed to insert image]()',
              onFileReceived: (file) => Boolean(onAttachImageRef.current && file.type.startsWith('image/')),
              progressText: '![Inserting image...]()',
              responseUrlKey: 'url',
              uploadHandler: async ({ file }) => {
                const handler = onAttachImageRef.current;
                if (!handler) {
                  throw new Error('Image attachments are unavailable.');
                }

                const result = await handler(file);
                return {
                  alt: file.name,
                  url: result.link,
                };
              },
              urlText: (url, response) => {
                const alt = typeof response === 'object' && response && 'alt' in response
                  ? String((response as { alt?: unknown }).alt ?? 'image')
                  : 'image';

                return formatMarkdownImage(alt, url);
              },
            }),
            EditorView.updateListener.of((update) => {
              if (update.docChanged) {
                onChangeRef.current(update.state.doc.toString());
              }
            }),
          ],
        }),
      });

      viewRef.current = view;
      view.contentDOM.dataset.hackdeskFocusTarget = 'true';
      if (pendingFocusRef.current) {
        pendingFocusRef.current = false;
        view.focus();
      }

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

    const handleDragEnter = (event: DragEvent<HTMLDivElement>) => {
      if (!hasImageFile(event.dataTransfer)) {
        return;
      }

      dragDepthRef.current += 1;
      setIsImageDragging(true);
    };

    const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
      if (!hasImageFile(event.dataTransfer)) {
        return;
      }

      event.preventDefault();
    };

    const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
      if (!hasImageFile(event.dataTransfer)) {
        return;
      }

      dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
      if (dragDepthRef.current === 0) {
        setIsImageDragging(false);
      }
    };

    const handleDrop = () => {
      dragDepthRef.current = 0;
      setIsImageDragging(false);
    };

    return (
      <div className="relative flex min-h-0 flex-1">
        <div
          ref={parentRef}
          className="markdown-editor hackmd-markdown-editor min-h-0 flex-1 overflow-hidden"
          data-testid="hackmd-markdown-editor"
          onDragEnter={handleDragEnter}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        />
        {isImageDragging ? (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-2 rounded-[8px] border border-primary-default/50 bg-primary-soft/20 px-3 py-2 text-xs font-medium text-primary-default"
            data-testid="markdown-editor-image-drop-affordance"
          >
            Drop image to attach
          </div>
        ) : null}
      </div>
    );
  },
);

function hasImageFile(dataTransfer: DataTransfer) {
  return Array.from(dataTransfer.items ?? []).some((item) => (
    item.kind === 'file' && item.type.startsWith('image/')
  ));
}
