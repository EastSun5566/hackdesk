import type { ReactNode } from 'react';
import type { EditorView } from '@codemirror/view';

import type { AiInlineState } from '@/components/hackmd-live-preview/ai-inline/state';
import type { DictationHost } from '@/components/hackmd-live-preview/dictation/extension';
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
  /** Starts dictating at the selection, or stops and inserts; false when dictation is unavailable. */
  toggleDictation: () => boolean;
  openSearch: () => void;
  revealText: (query: string) => boolean;
  /** Highlights `[from, to)` if it still holds `expectedText`, else the first match of `expectedText`. */
  revealRange: (from: number, to: number, expectedText: string) => boolean;
};

/** Inline AI is owned by the page: the editor only hosts its panel and previews its answers. */
export type MarkdownEditorAi = {
  available: boolean;
  selectionChip: boolean;
  renderPanel: (props: { view: EditorView; session: AiInlineState }) => ReactNode;
  onSessionChange?: (session: AiInlineState, view: EditorView) => void;
};

/** Dictation is owned by the page: the editor shows what is heard and inserts the transcript. */
export type MarkdownEditorDictation = {
  start: DictationHost['start'];
  /** The current Start Dictation shortcut, such as "⇧⌘D". */
  shortcutLabel: string;
  isShortcut: DictationHost['isShortcut'];
};

export type MarkdownEditorProps = {
  ai?: MarkdownEditorAi | null;
  dictation?: MarkdownEditorDictation | null;
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
