import { chmod, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import {
  AI_PROVIDER_COMMANDS,
  AI_PROVIDER_IDS,
  AI_PROVIDER_TITLES,
  type AiProviderId,
  type AiProviderStatus,
  type AiTurnInput,
} from '../../../../src/lib/ai';
import type { AppSettings } from '../../../../src/lib/settings';
import { claudeProvider } from './claude-cli';
import { createCodexProvider } from './codex-app-server';
import { resolveCommand, type LocatorOptions } from './executable-locator';
import { AI_SYSTEM_PROMPT, buildAiPrompt } from './prompts';
import type { AiProviderAdapter, ProviderLaunch } from './provider-types';

export type AiServiceOptions = {
  appVersion: string;
  /** `~/.hackdesk/ai`; each provider gets its own private, empty working folder inside. */
  rootPath: string;
  readSettings: () => Promise<AppSettings>;
  adapters?: Partial<Record<AiProviderId, AiProviderAdapter>>;
  locator?: LocatorOptions;
};

function emptyStatus(id: AiProviderId, enabled: boolean): AiProviderStatus {
  return { id, enabled, phase: 'idle', message: null, version: null, command: null, plan: null, models: [], usage: null };
}

export function createAiService(options: AiServiceOptions) {
  const adapters: Record<AiProviderId, AiProviderAdapter> = {
    codex: options.adapters?.codex ?? createCodexProvider(options.appVersion),
    claude: options.adapters?.claude ?? claudeProvider,
  };
  const statuses = new Map<AiProviderId, AiProviderStatus>();
  const refreshes = new Map<AiProviderId, Promise<AiProviderStatus>>();

  async function prepareWorkspace(id: AiProviderId) {
    const path = join(options.rootPath, id, 'workspace');
    await mkdir(path, { recursive: true, mode: 0o700 });
    // `mkdir` leaves an existing folder's mode alone; the workspace must stay private either way.
    if (process.platform !== 'win32') await chmod(path, 0o700);
    return path;
  }

  async function resolveLaunch(id: AiProviderId, settings: AppSettings): Promise<ProviderLaunch | { error: string }> {
    const resolved = await resolveCommand(AI_PROVIDER_COMMANDS[id], settings.ai.providers[id].commandPath, options.locator);
    if (!resolved.ok) return { error: resolved.message };
    return { executable: resolved.executable, env: resolved.env, cwd: await prepareWorkspace(id) };
  }

  async function check(id: AiProviderId): Promise<AiProviderStatus> {
    const settings = await options.readSettings();
    const enabled = settings.ai.providers[id].enabled;
    const resolved = await resolveCommand(AI_PROVIDER_COMMANDS[id], settings.ai.providers[id].commandPath, options.locator);
    if (!resolved.ok) {
      return { ...emptyStatus(id, enabled), phase: 'not-installed', message: resolved.message };
    }
    // Locating the command runs nothing; only a provider the user turned on is started.
    if (!enabled) return { ...emptyStatus(id, false), command: resolved.executable };
    const probe = await adapters[id].probe({ executable: resolved.executable, env: resolved.env, cwd: await prepareWorkspace(id) });
    return { ...emptyStatus(id, true), ...probe, command: resolved.executable };
  }

  function refresh(id: AiProviderId) {
    const running = refreshes.get(id);
    if (running) return running;
    const task = check(id)
      .catch((error: unknown): AiProviderStatus => ({
        ...(statuses.get(id) ?? emptyStatus(id, false)),
        phase: 'failed',
        message: error instanceof Error ? error.message : String(error),
      }))
      .then((status) => {
        statuses.set(id, status);
        return status;
      })
      .finally(() => refreshes.delete(id));
    refreshes.set(id, task);
    return task;
  }

  async function listProviders() {
    const settings = await options.readSettings();
    return AI_PROVIDER_IDS.map((id) => {
      const enabled = settings.ai.providers[id].enabled;
      const cached = statuses.get(id);
      if (!cached) return emptyStatus(id, enabled);
      // A provider switched off since its last check keeps nothing from the time it ran.
      return cached.enabled === enabled ? cached : { ...emptyStatus(id, enabled), command: cached.command };
    });
  }

  async function runTurn(input: AiTurnInput, signal: AbortSignal, onDelta: (text: string) => void) {
    const settings = await options.readSettings();
    const providerSettings = settings.ai.providers[input.providerId];
    const title = AI_PROVIDER_TITLES[input.providerId];
    if (!providerSettings.enabled) throw new Error(`Turn on ${title} in Settings › AI before using it.`);
    const launch = await resolveLaunch(input.providerId, settings);
    if ('error' in launch) throw new Error(launch.error);
    let text = '';
    await adapters[input.providerId].stream(launch, {
      model: providerSettings.model,
      system: AI_SYSTEM_PROMPT,
      prompt: buildAiPrompt(input),
      signal,
      onDelta: (delta) => {
        text += delta;
        onDelta(delta);
      },
    });
    return text;
  }

  /** Called after settings change: a provider switched off must not keep a process running. */
  function applySettings(settings: AppSettings['ai']) {
    for (const id of AI_PROVIDER_IDS) {
      if (!settings.providers[id].enabled) adapters[id].dispose?.();
    }
  }

  function dispose() {
    for (const adapter of Object.values(adapters)) adapter.dispose?.();
  }

  return { listProviders, refresh, runTurn, applySettings, dispose };
}
