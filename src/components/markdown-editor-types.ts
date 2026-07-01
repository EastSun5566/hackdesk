import type { EditorMode } from '@/lib/settings';

export type MarkdownEditorHandle = {
  focus: () => void;
  getContentDOM: () => HTMLElement | null;
  getMarkdown: () => string;
  insertText: (text: string) => void;
  openSearch: () => void;
};

export type MarkdownEditorProps = {
  editorMode?: EditorMode;
  value: string;
  onChange: (value: string) => void;
  onAttachImage?: (file: File) => Promise<{ link: string }>;
};
