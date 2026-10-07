import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useWorkbenchEditorRequests, type EditorRequestTarget } from './useWorkbenchEditorRequests';

const target: EditorRequestTarget = { scopeKey: 'local:A', paneId: 'pane-a', tabId: 'tab-a', documentId: 'note-a' };

describe('useWorkbenchEditorRequests', () => {
  it('captures the command target and consumes each request once', () => {
    const { result } = renderHook(() => useWorkbenchEditorRequests(target));
    act(() => {
      result.current.requestEditorFocus();
      result.current.bumpEditorSearchRequest();
      result.current.bumpAttachImageRequest();
    });
    expect(result.current.editorRequests).toEqual(['focus', 'search', 'attach-image'].map((kind, i) => ({ ...target, kind, id: i + 1 })));
    act(() => result.current.consumeEditorRequest(2));
    expect(result.current.editorRequests.map(request => request.kind)).toEqual(['focus', 'attach-image']);
    act(() => result.current.consumeEditorRequest(1));
    act(() => result.current.consumeEditorRequest(3));
    expect(result.current.editorRequests).toEqual([]);
  });

  it.each(['scopeKey', 'paneId', 'tabId', 'documentId'] as const)('cancels pending requests across a %s change and does not replay on return', field => {
    const { result, rerender } = renderHook(({ destination }) => useWorkbenchEditorRequests(destination), { initialProps: { destination: target } });
    const originalHandler = result.current.bumpEditorSearchRequest;
    act(() => result.current.bumpEditorSearchRequest());
    const nextTarget = { ...target, [field]: 'other' };
    rerender({ destination: nextTarget });
    expect(result.current.editorRequests).toEqual([]);
    act(() => originalHandler());
    expect(result.current.editorRequests).toEqual([]);
    act(() => result.current.bumpEditorSearchRequest());
    expect(result.current.editorRequests).toEqual([{ ...nextTarget, kind: 'search', id: 3 }]);
    rerender({ destination: target });
    expect(result.current.editorRequests).toEqual([]);
  });

  it('does not enqueue work without a ready target', () => {
    const { result } = renderHook(() => useWorkbenchEditorRequests(null));
    act(() => result.current.bumpAttachImageRequest());
    expect(result.current.editorRequests).toEqual([]);
  });
});
