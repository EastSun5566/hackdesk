import type { EditorMode } from '@/lib/settings';

export type MarkdownEditorHandle = {
  focus: () => void;
  getContentDOM: () => HTMLElement | null;
  getMarkdown: () => string;
  insertText: (text: string) => void;
  openSearch: () => void;
  revealText: (query: string) => boolean;
};

export type MarkdownEditorProps = {
  editorMode?: EditorMode;
  initialRevealText?: string | null;
  value: string;
  onChange: (value: string) => void;
  onAttachImage?: (file: File) => Promise<{ link: string }>;
  onOpenLink?: (url: string) => void;
};
