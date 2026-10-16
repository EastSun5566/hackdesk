import { describe, expect, it } from 'vitest';

import type { NoteComment } from '@/lib/electron-api';

import { groupCommentThreads } from './useNoteComments';

function comment(overrides: Partial<NoteComment>): NoteComment {
  return {
    id: 'c', threadId: 't', actor: { kind: 'user', displayName: 'Ada' }, body: '', status: 'open', statusReason: null,
    isThreadHead: false, threadStatus: null, threadStatusReason: null, anchor: null, currentAnchor: null, excerpt: null,
    createdAtMillis: 1, updatedAtMillis: 1, ...overrides,
  };
}

describe('groupCommentThreads', () => {
  it('groups replies under their head, oldest first, and keeps resolved threads apart', () => {
    const openHead = comment({ id: 'h-1', threadId: 't-1', isThreadHead: true, threadStatus: 'open', createdAtMillis: 20 });
    const resolvedHead = comment({ id: 'h-2', threadId: 't-2', isThreadHead: true, threadStatus: 'hidden', threadStatusReason: 'resolved', createdAtMillis: 10 });
    const late = comment({ id: 'r-2', threadId: 't-1', createdAtMillis: 40 });
    const early = comment({ id: 'r-1', threadId: 't-1', createdAtMillis: 30 });

    expect(groupCommentThreads([late, openHead, resolvedHead, early])).toEqual({
      open: [{ head: openHead, replies: [early, late] }],
      resolved: [{ head: resolvedHead, replies: [] }],
    });
  });

  it('leaves out threads and replies hidden as spam, and replies without a head', () => {
    const spamThread = comment({ id: 'h-1', threadId: 't-1', isThreadHead: true, threadStatus: 'hidden', threadStatusReason: 'spam' });
    const hiddenHead = comment({ id: 'h-2', threadId: 't-2', isThreadHead: true, threadStatus: 'open', status: 'hidden', statusReason: 'abuse' });
    const head = comment({ id: 'h-3', threadId: 't-3', isThreadHead: true, threadStatus: 'open' });
    const hiddenReply = comment({ id: 'r-1', threadId: 't-3', status: 'hidden', statusReason: 'off_topic' });
    const orphan = comment({ id: 'r-2', threadId: 't-9' });

    expect(groupCommentThreads([spamThread, hiddenHead, head, hiddenReply, orphan])).toEqual({
      open: [{ head, replies: [] }],
      resolved: [],
    });
  });
});
