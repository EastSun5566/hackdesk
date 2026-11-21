import { useCallback, useRef, useState } from 'react';

export type EditorRequestTarget = {
  scopeKey: string;
  paneId: string;
  tabId: string;
  documentId: string;
};

export type EditorRequest = EditorRequestTarget & {
  id: number;
  kind: 'focus' | 'search' | 'attach-image' | 'ai-assist' | 'dictate' | 'rename';
};

/** A note about to become the target: its tab doesn't exist yet, so it is named by where it opens. */
export type EditorFocusDestination = Pick<EditorRequestTarget, 'scopeKey' | 'paneId' | 'documentId'>;

type RequestState = {
  key: string;
  requests: EditorRequest[];
  /** A focus asked for a note being opened, waiting for the target that shows it. */
  awaiting: { destination: EditorFocusDestination; id: number } | null;
};

const shows = (target: EditorRequestTarget | null, destination: EditorFocusDestination) => target !== null
  && target.scopeKey === destination.scopeKey && target.paneId === destination.paneId && target.documentId === destination.documentId;

export function useWorkbenchEditorRequests(target: EditorRequestTarget | null) {
  const scopeKey = target?.scopeKey ?? '';
  const paneId = target?.paneId ?? '';
  const tabId = target?.tabId ?? '';
  const documentId = target?.documentId ?? '';
  const key = JSON.stringify([scopeKey, paneId, tabId, documentId]);
  const nextId = useRef(0);
  const [state, setState] = useState<RequestState>({ key, requests: [], awaiting: null });

  // Cancel before children commit. Returning to the target must not replay work. A focus awaited
  // for the note being opened becomes a request if this target shows it; any other change drops it.
  if (state.key !== key) {
    const awaited = state.awaiting && target && shows(target, state.awaiting.destination)
      ? [{ id: state.awaiting.id, kind: 'focus' as const, scopeKey, paneId, tabId, documentId }]
      : [];
    setState({ key, requests: awaited, awaiting: null });
  }

  const request = useCallback((kind: EditorRequest['kind']) => {
    if (!scopeKey || !paneId || !tabId) return;
    const entry: EditorRequest = { id: ++nextId.current, kind, scopeKey, paneId, tabId, documentId };
    setState(current => current.key === key
      ? { ...current, requests: [...current.requests.filter(item => item.kind !== kind), entry] }
      : current);
  }, [key, scopeKey, paneId, tabId, documentId]);

  /** Focus the editor of a note being opened, once its tab is the target; at once if it already is. */
  const requestEditorFocusOn = useCallback((destination: EditorFocusDestination) => {
    if (scopeKey === destination.scopeKey && paneId === destination.paneId && documentId === destination.documentId) {
      request('focus');
      return;
    }
    const awaiting = { destination, id: ++nextId.current };
    setState(current => current.key === key ? { ...current, awaiting } : current);
  }, [key, scopeKey, paneId, documentId, request]);

  const consume = useCallback((id: number) => {
    setState(current => current.requests.some(item => item.id === id)
      ? { ...current, requests: current.requests.filter(item => item.id !== id) }
      : current);
  }, []);

  const requestEditorFocus = useCallback(() => request('focus'), [request]);
  const bumpEditorSearchRequest = useCallback(() => request('search'), [request]);
  const bumpAttachImageRequest = useCallback(() => request('attach-image'), [request]);
  const bumpAiAssistRequest = useCallback(() => request('ai-assist'), [request]);
  const bumpDictateRequest = useCallback(() => request('dictate'), [request]);
  const bumpRenameRequest = useCallback(() => request('rename'), [request]);

  return {
    editorRequests: state.key === key ? state.requests : [],
    consumeEditorRequest: consume,
    requestEditorFocus,
    requestEditorFocusOn,
    bumpEditorSearchRequest,
    bumpAttachImageRequest,
    bumpAiAssistRequest,
    bumpDictateRequest,
    bumpRenameRequest,
  };
}
