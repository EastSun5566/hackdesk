import { act, render, screen, waitFor } from '@testing-library/react';
import { EditorView } from '@codemirror/view';
import { describe, expect, it, vi } from 'vitest';

import { HackmdMarkdownEditorCore } from './HackmdMarkdownEditorCore';

const deferredVimModule = vi.hoisted(() => {
  let resolvePromise: (module: { vim: () => never[] }) => void = () => undefined;
  const promise = new Promise<{ vim: () => never[] }>((resolve) => {
    resolvePromise = resolve;
  });

  return {
    promise,
    resolve: (module: { vim: () => never[] }) => resolvePromise(module),
  };
});

vi.mock('@replit/codemirror-vim', () => deferredVimModule.promise);

describe('HackmdMarkdownEditorCore lifecycle', () => {
  it('does not dispatch a modal extension after the editor is destroyed', async () => {
    const dispatchSpy = vi.spyOn(EditorView.prototype, 'dispatch');
    const { unmount } = render(
      <HackmdMarkdownEditorCore editorMode="vim" value="# Hello" onChange={vi.fn()} />,
    );
    const editor = screen.getByTestId('hackmd-markdown-editor');

    await waitFor(() => {
      expect(editor.querySelector('.cm-editor')).toHaveAttribute('data-editor-mode-loading', 'true');
    });

    unmount();
    const dispatchCountAfterUnmount = dispatchSpy.mock.calls.length;

    deferredVimModule.resolve({ vim: () => [] });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(dispatchSpy).toHaveBeenCalledTimes(dispatchCountAfterUnmount);
    dispatchSpy.mockRestore();
  });
});
