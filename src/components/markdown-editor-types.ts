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
  openSearch: () => void;
  revealText: (query: string) => boolean;
};

export type MarkdownEditorProps = {
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
