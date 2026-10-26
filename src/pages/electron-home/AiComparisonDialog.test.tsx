import { fireEvent, render, screen } from '@testing-library/react';
import { EditorSelection, EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { afterEach, expect, it, vi } from 'vitest';

import { aiInlineField, finishAiInlineRun, getAiInlineState, openAiComparison, openAiInline, startAiInlineRun } from '@/components/hackmd-live-preview/ai-inline/state';
import { AiComparisonDialog } from './AiComparisonDialog';

vi.mock('@/components/NoteComparisonView', () => ({
  NoteComparisonView: ({ input }: { input: { before: string; after: string } }) => <>
    <pre aria-label="Before">{input.before}</pre><pre aria-label="After AI">{input.after}</pre>
  </>,
}));

let view: EditorView;
afterEach(() => { view.destroy(); view.dom.parentElement?.remove(); });

function setup() {
  view = new EditorView({ parent: document.body.appendChild(document.createElement('div')), state: EditorState.create({
    doc: 'Before\n\nHelo\n\nKeep this', selection: EditorSelection.single(12, 8), extensions: [aiInlineField],
  }) });
  view.dispatch({ effects: openAiInline.of({ from: 8, to: 12 }) });
  const { session } = getAiInlineState(view.state);
  view.dispatch({ effects: startAiInlineRun.of({ delivery: 'replace' }) });
  view.dispatch({ effects: finishAiInlineRun.of({ session, output: ' Hello ' }) });
  view.dispatch({ effects: openAiComparison.of(null) });
  const snapshot = getAiInlineState(view.state).comparison!;
  render(<AiComparisonDialog view={view} snapshot={snapshot} />);
  return snapshot;
}

it('shows the whole note without editing it, then returns to the original selection', () => {
  const snapshot = setup();
  expect(screen.getByLabelText('Before')).toHaveTextContent('Before Helo Keep this');
  expect(screen.getByLabelText('After AI')).toHaveTextContent('Before Hello Keep this');
  expect(view.state.doc).toBe(snapshot.doc);
  view.dispatch({ selection: { anchor: 0 } });
  fireEvent.click(screen.getByRole('button', { name: 'Back' }));
  expect(getAiInlineState(view.state)).toMatchObject({ phase: 'preview', comparison: null });
  expect(view.state.selection.eq(snapshot.selection)).toBe(true);
});

it('refuses an obsolete accept handler after the document changes', () => {
  setup();
  view.dispatch({ changes: { from: 0, insert: 'New ' } });
  fireEvent.click(screen.getByRole('button', { name: 'Replace' }));
  expect(view.state.sliceDoc()).toBe('New Before\n\nHelo\n\nKeep this');
  expect(getAiInlineState(view.state).comparison).toBeNull();
});
