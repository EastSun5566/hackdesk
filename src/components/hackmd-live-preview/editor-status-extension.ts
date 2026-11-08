import type { EditorMode } from '@/lib/settings';
import {
  clearEditorStatus,
  countWordsInText,
  publishEditorStatus,
  type EditorStatusSnapshot,
} from '@/lib/editor-status-store';
import { EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view';

const WORD_COUNT_DEBOUNCE_MS = 250;

type ActiveEditorStatus = {
  editorMode: EditorMode;
  vimMode: string | null;
  kakouneMode: string | null;
  line: number;
  column: number;
  wordCount: number;
  wordCountTimer: number | undefined;
  vimDispose: (() => void) | undefined;
  vimAttaching: boolean;
};

let focusedView: EditorView | null = null;
/** Editors still mounted, newest last: one takes over as the source when the current one goes. */
const liveViews = new Set<EditorView>();
const viewStatuses = new WeakMap<EditorView, ActiveEditorStatus>();

function readEditorMode(view: EditorView): EditorMode {
  const mode = view.dom.dataset.editorMode;
  return mode === 'vim' || mode === 'helix' || mode === 'emacs' || mode === 'kakoune' ? mode : 'standard';
}

function formatVimMode(mode: string, subMode?: string) {
  const label = mode.toUpperCase();
  if (!subMode) return label;
  if (subMode === 'linewise') return 'VISUAL LINE';
  if (subMode === 'blockwise') return 'VISUAL BLOCK';
  return label;
}

function selectionPosition(view: EditorView) {
  const head = view.state.selection.main.head;
  const line = view.state.doc.lineAt(head);
  return { line: line.number, column: head - line.from + 1 };
}

function snapshotForView(status: ActiveEditorStatus): EditorStatusSnapshot {
  return {
    active: true,
    editorMode: status.editorMode,
    vimMode: status.editorMode === 'vim' ? status.vimMode : null,
    kakouneMode: status.editorMode === 'kakoune' ? status.kakouneMode : null,
    line: status.line,
    column: status.column,
    wordCount: status.wordCount,
  };
}

function publishFocusedView() {
  if (!focusedView) {
    clearEditorStatus();
    return;
  }
  const status = viewStatuses.get(focusedView);
  if (!status) {
    clearEditorStatus();
    return;
  }
  publishEditorStatus(snapshotForView(status));
}

function scheduleWordCount(view: EditorView, status: ActiveEditorStatus) {
  window.clearTimeout(status.wordCountTimer);
  status.wordCountTimer = window.setTimeout(() => {
    if (focusedView !== view) return;
    status.wordCount = countWordsInText(view.state.doc.toString());
    publishFocusedView();
  }, WORD_COUNT_DEBOUNCE_MS);
}

function syncKakouneMode(view: EditorView, status: ActiveEditorStatus) {
  if (status.editorMode !== 'kakoune') return;
  const mode = view.dom.dataset.kakouneMode;
  status.kakouneMode = mode === 'insert' ? 'INS' : mode === 'select' ? 'SEL' : null;
}

async function attachVimListener(view: EditorView, status: ActiveEditorStatus) {
  status.vimDispose?.();
  status.vimDispose = undefined;
  if (status.editorMode !== 'vim' || status.vimAttaching) return;
  status.vimAttaching = true;
  const { getCM } = await import('@replit/codemirror-vim');
  status.vimAttaching = false;
  // Vim loads after the editor; until it has, updates keep retrying (see updateViewState).
  const cm = getCM(view);
  if (!cm || status.vimDispose) return;
  // Vim starts in Normal mode and only reports later changes.
  status.vimMode ??= 'NORMAL';
  if (focusedView === view) publishFocusedView();
  const onModeChange = (payload: { mode: string; subMode?: string }) => {
    status.vimMode = formatVimMode(payload.mode, payload.subMode);
    if (focusedView === view) publishFocusedView();
  };
  cm.on('vim-mode-change', onModeChange);
  status.vimDispose = () => cm.off('vim-mode-change', onModeChange);
}

function ensureStatus(view: EditorView): ActiveEditorStatus {
  let status = viewStatuses.get(view);
  if (status) return status;
  const editorMode = readEditorMode(view);
  const position = selectionPosition(view);
  status = {
    editorMode,
    vimMode: null,
    kakouneMode: null,
    line: position.line,
    column: position.column,
    wordCount: countWordsInText(view.state.doc.toString()),
    wordCountTimer: undefined,
    vimDispose: undefined,
    vimAttaching: false,
  };
  syncKakouneMode(view, status);
  viewStatuses.set(view, status);
  void attachVimListener(view, status);
  return status;
}

function setFocusedView(view: EditorView | null) {
  focusedView = view;
  publishFocusedView();
}

function updateViewState(view: EditorView, update: ViewUpdate) {
  const status = ensureStatus(view);
  const editorMode = readEditorMode(view);
  if (status.editorMode !== editorMode) {
    status.editorMode = editorMode;
    status.vimMode = null;
    void attachVimListener(view, status);
  } else if (status.editorMode === 'vim' && !status.vimDispose) {
    void attachVimListener(view, status);
  }
  syncKakouneMode(view, status);

  if (update.selectionSet) {
    const position = selectionPosition(view);
    status.line = position.line;
    status.column = position.column;
  }
  if (update.docChanged) {
    scheduleWordCount(view, status);
  } else if (update.selectionSet && focusedView === view) {
    publishFocusedView();
  }
}

const focusTracker = ViewPlugin.fromClass(class {
  private readonly onFocus: () => void;

  // No blur handling on purpose: leaving the editor keeps it as the status source, so the line
  // dims that half instead of emptying it. Another editor takes over on focus, or on destroy.
  constructor(private readonly view: EditorView) {
    this.onFocus = () => {
      setFocusedView(view);
      const status = ensureStatus(view);
      publishEditorStatus(snapshotForView(status));
    };
    view.dom.addEventListener('focusin', this.onFocus);
    // A new editor with no other source (the first one, or after switching tabs) reports at once.
    liveViews.add(view);
    if (view.hasFocus || !focusedView) this.onFocus();
    else ensureStatus(view);
  }

  update(update: ViewUpdate) {
    if (focusedView === update.view) {
      updateViewState(update.view, update);
    } else if (update.view.hasFocus) {
      this.onFocus();
      updateViewState(update.view, update);
    }
  }

  destroy() {
    this.view.dom.removeEventListener('focusin', this.onFocus);
    const status = viewStatuses.get(this.view);
    status?.vimDispose?.();
    window.clearTimeout(status?.wordCountTimer);
    viewStatuses.delete(this.view);
    liveViews.delete(this.view);
    if (focusedView === this.view) {
      const next = [...liveViews].at(-1) ?? null;
      setFocusedView(next);
      if (next) publishEditorStatus(snapshotForView(ensureStatus(next)));
    }
  }
});

export const editorStatusExtension = focusTracker;
