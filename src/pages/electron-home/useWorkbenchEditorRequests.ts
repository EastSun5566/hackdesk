import { useCallback, useRef, useState } from 'react';

export type EditorRequestTarget = {
  scopeKey: string;
  paneId: string;
  tabId: string;
  documentId: string;
};

export type EditorRequest = EditorRequestTarget & {
  id: number;
  kind: 'focus' | 'search' | 'attach-image';
};

export function useWorkbenchEditorRequests(target: EditorRequestTarget | null) {
  const scopeKey = target?.scopeKey ?? '';
  const paneId = target?.paneId ?? '';
  const tabId = target?.tabId ?? '';
  const documentId = target?.documentId ?? '';
  const key = JSON.stringify([scopeKey, paneId, tabId, documentId]);
  const nextId = useRef(0);
  const [state, setState] = useState<{ key: string; requests: EditorRequest[] }>({ key, requests: [] });

  // Cancel before children commit. Returning to the target must not replay work.
  if (state.key !== key) setState({ key, requests: [] });

  const request = useCallback((kind: EditorRequest['kind']) => {
    if (!scopeKey || !paneId || !tabId) return;
    const entry: EditorRequest = { id: ++nextId.current, kind, scopeKey, paneId, tabId, documentId };
    setState(current => current.key === key
      ? { key, requests: [...current.requests.filter(item => item.kind !== kind), entry] }
      : current);
  }, [key, scopeKey, paneId, tabId, documentId]);

  const consume = useCallback((id: number) => {
    setState(current => current.requests.some(item => item.id === id)
      ? { ...current, requests: current.requests.filter(item => item.id !== id) }
      : current);
  }, []);

  const requestEditorFocus = useCallback(() => request('focus'), [request]);
  const bumpEditorSearchRequest = useCallback(() => request('search'), [request]);
  const bumpAttachImageRequest = useCallback(() => request('attach-image'), [request]);

  return {
    editorRequests: state.key === key ? state.requests : [],
    consumeEditorRequest: consume,
    requestEditorFocus,
    bumpEditorSearchRequest,
    bumpAttachImageRequest,
  };
}
