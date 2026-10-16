import { act, renderHook, waitFor } from '@testing-library/react';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { IDLE_AI_INLINE } from '@/components/hackmd-live-preview/ai-inline/state';
import { notifyAiSettingsChanged, type AiProviderStatus } from '@/lib/ai';
import { defaultSettings } from '@/lib/settings';

import { useAiInline } from './useAiInline';

function status(id: AiProviderStatus['id'], enabled: boolean): AiProviderStatus {
  return { id, enabled, phase: 'ready', message: null, version: '1', command: null, plan: null, models: [], usage: null };
}

function installApi() {
  let enabled = false;
  const listProviders = vi.fn(async () => [status('codex', false), status('claude', enabled)]);
  window.hackdeskAPI = {
    getRuntimeEnvironment: () => 'electron',
    settings: { get: vi.fn(async () => ({ ai: defaultSettings.ai })) },
    ai: { listProviders, refreshProvider: vi.fn(), runTurn: vi.fn(), cancelTurn: vi.fn(async () => undefined) },
  } as unknown as typeof window.hackdeskAPI;
  return { listProviders, enable: () => { enabled = true; } };
}

afterEach(() => {
  delete window.hackdeskAPI;
  document.body.innerHTML = '';
});

describe('useAiInline', () => {
  it('picks up a provider turned on in Settings without reopening the note', async () => {
    const api = installApi();
    const { result } = renderHook(() => useAiInline({ noteTitle: 'Note', isTeamNote: false }));
    await waitFor(() => expect(api.listProviders).toHaveBeenCalledOnce());
    expect(result.current?.available).toBe(false);

    api.enable();
    act(() => notifyAiSettingsChanged());
    await waitFor(() => expect(result.current?.available).toBe(true));
  });

  it('gives focus back to the editor only when nothing else has it', async () => {
    installApi();
    const { result } = renderHook(() => useAiInline({ noteTitle: '', isTeamNote: false }));
    const view = new EditorView({ parent: document.body.appendChild(document.createElement('div')), state: EditorState.create({ doc: 'x' }) });
    const focus = vi.spyOn(view, 'focus');

    const title = document.body.appendChild(document.createElement('input'));
    title.focus();
    result.current?.onSessionChange?.(IDLE_AI_INLINE, view);
    expect(focus).not.toHaveBeenCalled();

    title.blur();
    result.current?.onSessionChange?.(IDLE_AI_INLINE, view);
    expect(focus).toHaveBeenCalledOnce();
    view.destroy();
  });
});
