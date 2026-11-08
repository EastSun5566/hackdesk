import { useSyncExternalStore } from 'react';

import type { EditorMode } from '@/lib/settings';

const CJK_CHAR = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;

export type EditorStatusSnapshot = {
  active: boolean;
  editorMode: EditorMode | null;
  vimMode: string | null;
  kakouneMode: string | null;
  line: number;
  column: number;
  wordCount: number;
};

const EMPTY_STATUS: EditorStatusSnapshot = {
  active: false,
  editorMode: null,
  vimMode: null,
  kakouneMode: null,
  line: 1,
  column: 1,
  wordCount: 0,
};

let snapshot: EditorStatusSnapshot = EMPTY_STATUS;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

export function getEditorStatusSnapshot() {
  return snapshot;
}

export function subscribeEditorStatus(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useEditorStatus() {
  return useSyncExternalStore(subscribeEditorStatus, getEditorStatusSnapshot, () => EMPTY_STATUS);
}

export function publishEditorStatus(next: EditorStatusSnapshot) {
  if (
    snapshot.active === next.active
    && snapshot.editorMode === next.editorMode
    && snapshot.vimMode === next.vimMode
    && snapshot.kakouneMode === next.kakouneMode
    && snapshot.line === next.line
    && snapshot.column === next.column
    && snapshot.wordCount === next.wordCount
  ) {
    return;
  }
  snapshot = next;
  emit();
}

export function clearEditorStatus() {
  publishEditorStatus(EMPTY_STATUS);
}

/** Markdown-style word count: each CJK glyph is a word; other text splits on whitespace. */
export function countWordsInText(text: string): number {
  let count = 0;
  let inWord = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]!;
    if (CJK_CHAR.test(char)) {
      if (inWord) inWord = false;
      count += 1;
      continue;
    }
    if (/\s/.test(char)) {
      inWord = false;
      continue;
    }
    if (!inWord) {
      inWord = true;
      count += 1;
    }
  }
  return count;
}
