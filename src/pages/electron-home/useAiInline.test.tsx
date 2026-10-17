import type { ReactElement } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { aiInline, openAiInlineMenu, type AiInlineHost } from '@/components/hackmd-live-preview/ai-inline/extension';
import { getAiInlineState, IDLE_AI_INLINE } from '@/components/hackmd-live-preview/ai-inline/state';
import { notifyAiSettingsChanged, type AiProviderStatus } from '@/lib/ai';
import { defaultSettings } from '@/lib/settings';

import { useAiInline, type AiInlineController } from './useAiInline';

function status(id: AiProviderStatus['id'], enabled: boolean): AiProviderStatus {
  return { id, enabled, phase: 'ready', message: null, version: '1', command: null, plan: null, models: [], usage: null, apiKeyInEnvironment: false };
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
  it('runs a saved command with its placement and reloads commands when Settings saves', async () => {
    const command = { id: 'c1', name: 'To-dos', prompt: 'List the to-dos', delivery: 'insert-below' as const };
    let commands = [command];
    const runTurn = vi.fn(() => new Promise<string>(() => undefined));
    window.hackdeskAPI = {
      getRuntimeEnvironment: () => 'electron',
      settings: { get: vi.fn(async () => ({ ai: { ...defaultSettings.ai, customCommands: commands } })) },
      ai: {
        listProviders: vi.fn(async () => [status('claude', true)]),
        refreshProvider: vi.fn(),
        runTurn,
        cancelTurn: vi.fn(async () => undefined),
        prewarm: vi.fn(async () => undefined),
      },
    } as unknown as typeof window.hackdeskAPI;
    const host: AiInlineHost = {
      isAvailable: () => true,
      showSelectionChip: () => false,
      shortcutLabel: () => '⌘K',
      mountPanel: () => undefined,
      releasePanel: () => undefined,
      onStateChange: () => undefined,
    };
    const view = new EditorView({
      parent: document.body.appendChild(document.createElement('div')),
      state: EditorState.create({ doc: 'Notes', selection: { anchor: 0, head: 5 }, extensions: [aiInline(host)] }),
    });
    openAiInlineMenu(view, host);
    const { result } = renderHook(() => useAiInline({ noteTitle: 'Note', isTeamNote: false }));
    const controller = () => (result.current!.renderPanel({ view, session: getAiInlineState(view.state) }) as ReactElement<{ controller: AiInlineController }>).props.controller;
    await waitFor(() => expect(controller().customCommands).toEqual([command]));

    act(() => controller().run(view, { action: 'custom', instruction: command.prompt, delivery: command.delivery, label: command.name, commandId: command.id }));
    expect(getAiInlineState(view.state)).toMatchObject({ phase: 'running', delivery: 'insert-below' });
    expect(runTurn).toHaveBeenCalledWith(expect.objectContaining({ action: 'custom', instruction: 'List the to-dos', delivery: 'insert-below' }), expect.any(Function));

    commands = [];
    act(() => notifyAiSettingsChanged());
    await waitFor(() => expect(controller().customCommands).toEqual([]));
    view.destroy();
  });

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
