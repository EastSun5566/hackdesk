import { beforeEach, describe, expect, it } from 'vitest';

import {
  clearAgentSession,
  createAgentMessage,
  createEmptyAgentSession,
  getPendingAgentLaunchIntent,
  loadAgentSession,
  saveAgentSession,
} from './agent';

function createMemoryStorage(): Storage {
  const store = new Map<string, string>();

  return {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key) {
      return store.has(key) ? store.get(key) ?? null : null;
    },
    key(index) {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key) {
      store.delete(key);
    },
    setItem(key, value) {
      store.set(key, value);
    },
  };
}

describe('agent helpers', () => {
  let storage: Storage;

  beforeEach(() => {
    storage = createMemoryStorage();
  });

  it('falls back to an empty session when nothing is stored', () => {
    const session = loadAgentSession(storage);

    expect(session.context).toBeNull();
    expect(session.messages).toEqual([]);
    expect(session.id).toBeTruthy();
  });

  it('persists and reloads an agent session', () => {
    const session = createEmptyAgentSession();
    const savedSession = {
      ...session,
      context: {
        url: 'https://hackmd.io/@michael/roadmap',
        path: '/@michael/roadmap',
        title: 'Roadmap - HackMD',
        noteId: 'roadmap',
        scope: 'personal-or-team' as const,
        teamPath: 'michael',
        isNote: true,
        reason: null,
        content: '# Roadmap\n\n- Ship agent MVP',
        contentReason: null,
      },
      messages: [createAgentMessage('user', 'Summarize this note.')],
    };

    saveAgentSession(savedSession, storage);

    expect(loadAgentSession(storage)).toEqual(savedSession);
  });

  it('normalizes legacy stored contexts that predate content grounding', () => {
    storage.setItem('hackdesk_agent_session', JSON.stringify({
      id: 'session-1',
      context: {
        url: 'https://hackmd.io/@michael/roadmap',
        path: '/@michael/roadmap',
        title: 'Roadmap - HackMD',
        noteId: 'roadmap',
        scope: 'personal-or-team',
        teamPath: 'michael',
        isNote: true,
        reason: null,
      },
      messages: [],
      updatedAt: '2026-04-25T00:00:00.000Z',
    }));

    expect(loadAgentSession(storage).context).toEqual({
      url: 'https://hackmd.io/@michael/roadmap',
      path: '/@michael/roadmap',
      title: 'Roadmap - HackMD',
      noteId: 'roadmap',
      scope: 'personal-or-team',
      teamPath: 'michael',
      isNote: true,
      reason: null,
      content: null,
      contentReason: null,
    });
  });

  it('clears the stored agent session', () => {
    saveAgentSession(createEmptyAgentSession(), storage);

    clearAgentSession(storage);

    expect(loadAgentSession(storage).messages).toEqual([]);
    expect(storage.getItem('hackdesk_agent_session')).toBeNull();
  });

  it('reads and clears the pending launch intent', () => {
    storage.setItem('hackdesk_agent_launch_intent', 'summary');

    expect(getPendingAgentLaunchIntent(storage)).toBe('summary');
    expect(storage.getItem('hackdesk_agent_launch_intent')).toBeNull();
    expect(getPendingAgentLaunchIntent(storage)).toBe('ask');
  });
});
