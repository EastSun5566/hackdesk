export type DocumentSyncState = 'idle' | 'loading' | 'cached' | 'saving' | 'saved' | 'save_failed' | 'conflict';

export const DOCUMENT_SYNC_STATE_LABELS: Record<DocumentSyncState, string> = {
  idle: 'Unsaved',
  loading: 'Loading…',
  cached: 'Cached',
  saving: 'Saving…',
  saved: 'Saved',
  save_failed: 'Save failed',
  conflict: 'Conflict',
};
