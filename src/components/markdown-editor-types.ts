import type { ReactNode } from 'react';
import type { EditorView } from '@codemirror/view';

import type { AiInlineState } from '@/components/hackmd-live-preview/ai-inline/state';
import type { EditorMode } from '@/lib/settings';
import type { LocalImageContext } from '@/lib/local-image';

export type MarkdownEditorHandle = {
  focus: () => void;
  getContentDOM: () => HTMLElement | null;
  getMarkdown: () => string;
  insertText: (text: string) => void;
  /** The main selection; an empty selection has `from === to`. */
  getSelection: () => { from: number; to: number; text: string };
  /** Replaces `from..to` only while it still reads `expected`; false means the note changed meanwhile. */
  replaceRange: (from: number, to: number, expected: string, text: string) => boolean;
  /** Opens the inline AI menu on the selection, or on the whole note; false when AI is unavailable. */
  openAiMenu: () => boolean;
  openSearch: () => void;
  revealText: (query: string) => boolean;
};

/** Inline AI is owned by the page: the editor only hosts its panel and previews its answers. */
export type MarkdownEditorAi = {
  available: boolean;
  selectionChip: boolean;
  renderPanel: (props: { view: EditorView; session: AiInlineState }) => ReactNode;
  onSessionChange?: (session: AiInlineState, view: EditorView) => void;
};

export type MarkdownEditorProps = {
  ai?: MarkdownEditorAi | null;
  localImageContext?: LocalImageContext | null;
  editorMode?: EditorMode;
  initialRevealText?: string | null;
  value: string;
  onChange: (value: string) => void;
  /**
   * Called after `placeholder` is inserted at the cursor. The owner uploads the
   * file and replaces the placeholder in the originating note's content.
   */
  onAttachImage?: (file: File, placeholder: string) => Promise<unknown>;
  onOpenLink?: (url: string) => void;
};
