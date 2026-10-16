import type { EditorMode } from '@/lib/settings';
import type { LocalImageContext } from '@/lib/local-image';

export type MarkdownEditorHandle = {
  focus: () => void;
  getContentDOM: () => HTMLElement | null;
  getMarkdown: () => string;
  insertText: (text: string) => void;
  openSearch: () => void;
  revealText: (query: string) => boolean;
  /** Highlights `[from, to)` if it still holds `expectedText`, else the first match of `expectedText`. */
  revealRange: (from: number, to: number, expectedText: string) => boolean;
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
