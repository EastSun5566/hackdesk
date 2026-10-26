import { useMemo } from 'react';
import type { EditorState } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';

import { NoteComparisonView } from '@/components/NoteComparisonView';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { acceptAiInline, closeAiComparison, getAiInlineEdit, getAiInlineState } from '@/components/hackmd-live-preview/ai-inline/state';

export function AiComparisonDialog({ view, snapshot }: { view: EditorView; snapshot: EditorState }) {
  const input = useMemo(() => {
    const edit = getAiInlineEdit(snapshot)!;
    return { kind: 'text' as const, before: snapshot.sliceDoc(), after: snapshot.changes(edit.changes).apply(snapshot.doc).toString() };
  }, [snapshot]);
  const isCurrent = () => view.dom.isConnected && getAiInlineState(view.state).comparison === snapshot && view.state.doc === snapshot.doc;
  const back = () => {
    if (isCurrent()) view.dispatch({ effects: closeAiComparison.of(null), selection: snapshot.selection });
  };
  return <Dialog open onOpenChange={(open) => { if (!open) back(); }}>
    <DialogContent
      size="xl" className="note-comparison-dialog flex flex-col overflow-hidden"
      finalFocus={() => view.dom.isConnected ? view.contentDOM : false}
      onKeyDown={event => event.stopPropagation()}
    >
      <DialogHeader className="shrink-0 pr-7">
        <DialogTitle>Compare AI changes</DialogTitle>
        <DialogDescription>Review the whole note before accepting this answer. Your draft has not changed.</DialogDescription>
      </DialogHeader>
      <div className="min-h-0 overflow-auto p-1">
        <NoteComparisonView input={input} beforeLabel="Before" afterLabel="After AI" />
      </div>
      <DialogFooter className="shrink-0 gap-2">
        <Button variant="secondary" onClick={back}>Back</Button>
        <Button onClick={() => { if (isCurrent()) acceptAiInline(view); }}>
          {getAiInlineState(snapshot).delivery === 'replace' ? 'Replace' : 'Insert'}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
