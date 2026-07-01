import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import type { DragEvent } from 'react';
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { markdown, markdownKeymap, markdownLanguage } from '@codemirror/lang-markdown';
import { bracketMatching, foldKeymap, indentOnInput } from '@codemirror/language';
import { searchKeymap, highlightSelectionMatches, openSearchPanel, search } from '@codemirror/search';
import { Compartment, EditorState, Prec, type Extension } from '@codemirror/state';
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

import type { MarkdownEditorHandle, MarkdownEditorProps } from '@/components/markdown-editor-types';
import { useTheme } from '@/components/theme-provider';
import type { EditorMode } from '@/lib/settings';
import type { ResolvedThemeMode } from '@/lib/themes';

import { hackmdCodeLanguages } from './hackmd-code-languages';
import { hfmBlocks } from './hfm-blocks';
import { hackmdTables } from './hackmd-tables';
import { hackmdInlinePreview } from './inline-preview';
import { createHackmdPreviewTheme } from './hackmd-preview-theme';
import { formatMarkdownImage } from './markdown-image';
import { createHackdeskSearchPanel } from './hackmd-search-panel';
import { hackmdRichPreviewNavigation } from './rich-preview-navigation';
import { hackmdRichPreviewWidgets } from './rich-preview-widgets';
import { treeProgressPlugin } from './tree-progress';

const reservedAppShortcutKeymap = Prec.highest(keymap.of([
  {
    key: 'Mod-f',
    run: (view) => openSearchPanel(view),
  },
]));

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
];

type LatestRef<T> = {
  current: T;
};

type EditorRuntime = {
  view: EditorView | null;
  editorModeCompartment: Compartment;
  themeCompartment: Compartment;
  appliedEditorMode: EditorMode;
  appliedResolvedMode: ResolvedThemeMode;
  editorModeRequestId: number;
  pendingFocus: boolean;
  value: string;
  editorMode: EditorMode;
  resolvedMode: ResolvedThemeMode;
};

type CreateEditorViewOptions = {
  parent: HTMLDivElement;
  runtime: EditorRuntime;
  onAttachImageRef: LatestRef<MarkdownEditorProps['onAttachImage']>;
  onChangeRef: LatestRef<MarkdownEditorProps['onChange']>;
};

function createEditorRuntime(
  value: string,
  editorMode: EditorMode,
  resolvedMode: ResolvedThemeMode,
): EditorRuntime {
  return {
    view: null,
    editorModeCompartment: new Compartment(),
    themeCompartment: new Compartment(),
    appliedEditorMode: 'standard',
    appliedResolvedMode: resolvedMode,
    editorModeRequestId: 0,
    pendingFocus: false,
    value,
    editorMode,
    resolvedMode,
  };
}

function useLatestRef<T>(value: T): LatestRef<T> {
  const ref = useRef(value);

  useLayoutEffect(() => {
    ref.current = value;
  }, [value]);

  return ref;
}

function createHackmdEditorView({
  parent,
  runtime,
  onAttachImageRef,
  onChangeRef,
}: CreateEditorViewOptions) {
  return new EditorView({
    parent,
    state: EditorState.create({
      doc: runtime.value,
      extensions: [
        reservedAppShortcutKeymap,
        runtime.editorModeCompartment.of([]),
        ...editorExtensions,
        runtime.themeCompartment.of(createHackmdPreviewTheme(runtime.resolvedMode)),
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
}

export const HackmdMarkdownEditorCore = forwardRef<MarkdownEditorHandle, MarkdownEditorProps>(
  function HackmdMarkdownEditorCore({
    editorMode = 'standard',
    value,
    onChange,
    onAttachImage,
  }, ref) {
    const { resolvedMode } = useTheme();
    const parentRef = useRef<HTMLDivElement | null>(null);
    const onAttachImageRef = useLatestRef(onAttachImage);
    const onChangeRef = useLatestRef(onChange);
    const [runtime] = useState(() => createEditorRuntime(value, editorMode, resolvedMode));
    const dragDepthRef = useRef(0);
    const [isImageDragging, setIsImageDragging] = useState(false);

    useImperativeHandle(ref, () => ({
      focus() {
        const view = runtime.view;
        if (!view) {
          runtime.pendingFocus = true;
          return;
        }

        view.focus();
      },
      getContentDOM() {
        return runtime.view?.contentDOM ?? null;
      },
      getMarkdown() {
        return runtime.view?.state.doc.toString() ?? runtime.value;
      },
      insertText(text: string) {
        const view = runtime.view;

        if (!view) {
          onChangeRef.current(`${runtime.value}${text}`);
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
        const view = runtime.view;
        if (!view) {
          return;
        }

        openSearchPanel(view);
      },
    }), [onChangeRef, runtime]);

    useLayoutEffect(() => {
      const parent = parentRef.current;
      if (!parent) {
        return undefined;
      }

      const view = createHackmdEditorView({
        parent,
        runtime,
        onAttachImageRef,
        onChangeRef,
      });

      runtime.view = view;
      runtime.appliedEditorMode = 'standard';
      runtime.appliedResolvedMode = runtime.resolvedMode;
      view.dom.dataset.editorMode = runtime.editorMode;
      view.dom.dataset.themeMode = runtime.resolvedMode;
      view.contentDOM.dataset.hackdeskFocusTarget = 'true';
      if (runtime.pendingFocus) {
        runtime.pendingFocus = false;
        view.focus();
      }

      return () => {
        runtime.editorModeRequestId += 1;
        view.destroy();
        if (runtime.view === view) {
          runtime.view = null;
          runtime.appliedEditorMode = 'standard';
          runtime.appliedResolvedMode = runtime.resolvedMode;
        }
      };
    }, [onAttachImageRef, onChangeRef, runtime]);

    useLayoutEffect(() => {
      runtime.resolvedMode = resolvedMode;
      const view = runtime.view;
      if (!view || runtime.appliedResolvedMode === resolvedMode) {
        return;
      }

      view.dispatch({
        effects: runtime.themeCompartment.reconfigure(createHackmdPreviewTheme(resolvedMode)),
      });
      view.dom.dataset.themeMode = resolvedMode;
      runtime.appliedResolvedMode = resolvedMode;
    }, [resolvedMode, runtime]);

    useEffect(() => {
      runtime.editorMode = editorMode;
      const view = runtime.view;
      if (!view) {
        return undefined;
      }

      const requestId = runtime.editorModeRequestId + 1;
      runtime.editorModeRequestId = requestId;
      let cancelled = false;
      const cancelRequest = () => {
        cancelled = true;
        if (runtime.editorModeRequestId === requestId) {
          runtime.editorModeRequestId += 1;
        }
      };

      view.dom.dataset.editorMode = editorMode;

      if (editorMode === 'standard') {
        delete view.dom.dataset.editorModeLoading;
        delete view.dom.dataset.editorModeError;
        if (runtime.appliedEditorMode !== 'standard') {
          view.dispatch({
            effects: runtime.editorModeCompartment.reconfigure([]),
          });
          runtime.appliedEditorMode = 'standard';
        }
        return cancelRequest;
      }

      if (runtime.appliedEditorMode === editorMode) {
        delete view.dom.dataset.editorModeLoading;
        delete view.dom.dataset.editorModeError;
        return cancelRequest;
      }

      if (runtime.appliedEditorMode !== 'standard') {
        view.dispatch({
          effects: runtime.editorModeCompartment.reconfigure([]),
        });
        runtime.appliedEditorMode = 'standard';
      }

      view.dom.dataset.editorModeLoading = 'true';
      delete view.dom.dataset.editorModeError;

      void createEditorModeExtension(editorMode)
        .then((extension) => {
          if (cancelled || runtime.editorModeRequestId !== requestId || runtime.view !== view) {
            return;
          }

          view.dispatch({
            effects: runtime.editorModeCompartment.reconfigure(extension),
          });
          view.dom.dataset.editorMode = editorMode;
          delete view.dom.dataset.editorModeLoading;
          delete view.dom.dataset.editorModeError;
          runtime.appliedEditorMode = editorMode;
        })
        .catch((error: unknown) => {
          if (cancelled || runtime.editorModeRequestId !== requestId || runtime.view !== view) {
            return;
          }

          delete view.dom.dataset.editorModeLoading;
          view.dom.dataset.editorModeError = 'true';
          console.error('Failed to load editor mode extension:', error);
        });

      return cancelRequest;
    }, [editorMode, runtime]);

    useLayoutEffect(() => {
      runtime.value = value;
      const view = runtime.view;

      if (!view) {
        return;
      }

      const currentValue = view.state.doc.toString();
      if (value !== currentValue) {
        view.dispatch({
          changes: { from: 0, to: currentValue.length, insert: value },
        });
      }
    }, [runtime, value]);

    const handleDragEnter = (event: DragEvent<HTMLDivElement>) => {
      if (!hasImageFile(event.dataTransfer)) {
        return;
      }

      dragDepthRef.current += 1;
      setIsImageDragging(true);
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
          onDragOver={handleImageDragOver}
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

type VimModule = typeof import('@replit/codemirror-vim');
type HelixModule = typeof import('codemirror-helix');
type LazyEditorMode = Exclude<EditorMode, 'standard'>;

let vimModulePromise: Promise<VimModule> | null = null;
let helixModulePromise: Promise<HelixModule> | null = null;

async function createEditorModeExtension(editorMode: LazyEditorMode): Promise<Extension> {
  switch (editorMode) {
  case 'vim':
    return loadVimModeExtension();
  case 'helix':
    return loadHelixModeExtension();
  }
}

async function loadVimModeExtension(): Promise<Extension> {
  vimModulePromise ??= import('@replit/codemirror-vim');
  const { vim } = await vimModulePromise;
  return vim({ status: true });
}

async function loadHelixModeExtension(): Promise<Extension> {
  helixModulePromise ??= import('codemirror-helix');
  const { helix } = await helixModulePromise;
  return helix({ drawSelection: false });
}

function hasImageFile(dataTransfer: DataTransfer) {
  return Array.from(dataTransfer.items ?? []).some((item) => (
    item.kind === 'file' && item.type.startsWith('image/')
  ));
}

function handleImageDragOver(event: DragEvent<HTMLDivElement>) {
  if (!hasImageFile(event.dataTransfer)) {
    return;
  }

  event.preventDefault();
}
