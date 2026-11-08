import { afterEach, describe, expect, it } from 'vitest';

import {
  clearEditorStatus,
  countWordsInText,
  getEditorStatusSnapshot,
  publishEditorStatus,
} from './editor-status-store';

describe('editor status store', () => {
  afterEach(() => {
    clearEditorStatus();
  });

  it('counts latin words and CJK characters separately', () => {
    expect(countWordsInText('')).toBe(0);
    expect(countWordsInText('hello world')).toBe(2);
    expect(countWordsInText('你好world')).toBe(3);
    expect(countWordsInText('こんにちは')).toBe(5);
  });

  it('publishes snapshots for subscribers', () => {
    publishEditorStatus({
      active: true,
      editorMode: 'vim',
      vimMode: 'NORMAL',
      kakouneMode: null,
      line: 2,
      column: 5,
      wordCount: 10,
    });
    expect(getEditorStatusSnapshot()).toMatchObject({ line: 2, column: 5, vimMode: 'NORMAL' });
    clearEditorStatus();
    expect(getEditorStatusSnapshot().active).toBe(false);
  });
});
