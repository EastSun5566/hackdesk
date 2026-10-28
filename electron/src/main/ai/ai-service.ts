import { chmod, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import {
  AI_PROVIDER_COMMANDS,
  AI_PROVIDER_IDS,
  AI_PROVIDER_TITLES,
  type AiProviderId,
  type AiProviderStatus,
  type AiTurnInput,
  type AskNotesInput,
} from '../../../../src/lib/ai';
import type { AppSettings } from '../../../../src/lib/settings';
import { claudeProvider } from './claude-cli';
import { createCodexProvider } from './codex-app-server';
import { resolveCommand, type LocatorOptions } from './executable-locator';
import { AI_SYSTEM_PROMPT, ASK_NOTES_SYSTEM_PROMPT, buildAiPrompt, buildAskNotesPrompt } from './prompts';
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
  return { id, enabled, phase: 'idle', message: null, version: null, command: null, plan: null, models: [], usage: null, apiKeyInEnvironment: false };
}

/** Claude Code bills an exported key instead of the claude.ai sign-in, so these can be held back. */
const ANTHROPIC_KEY_VARIABLES = ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN'];

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

  /** Finds the CLI and the environment it runs with; only `resolveLaunch` also prepares its folder. */
  async function locate(id: AiProviderId, settings: AppSettings) {
    const providerSettings = settings.ai.providers[id];
    const resolved = await resolveCommand(AI_PROVIDER_COMMANDS[id], providerSettings.commandPath, options.locator);
    if (!resolved.ok) return resolved;
    const env = { ...resolved.env };
    const apiKeyInEnvironment = id === 'claude' && ANTHROPIC_KEY_VARIABLES.some(key => Boolean(env[key]));
    if (id === 'claude' && providerSettings.ignoreApiKey) {
      for (const key of ANTHROPIC_KEY_VARIABLES) delete env[key];
    }
    // What the user would recognize: the script an npm shim runs, not the Node binary running it.
    const command = resolved.prefixArgs[0] ?? resolved.executable;
    return { ...resolved, env, apiKeyInEnvironment, command };
  }

  async function resolveLaunch(id: AiProviderId, settings: AppSettings): Promise<ProviderLaunch | { error: string }> {
    const located = await locate(id, settings);
    if (!located.ok) return { error: located.message };
    return { executable: located.executable, prefixArgs: located.prefixArgs, env: located.env, cwd: await prepareWorkspace(id) };
  }

  async function check(id: AiProviderId): Promise<AiProviderStatus> {
    const settings = await options.readSettings();
    const enabled = settings.ai.providers[id].enabled;
    const located = await locate(id, settings);
    if (!located.ok) {
      const phase = located.reason === 'unsupported-shim' ? 'failed' : 'not-installed';
      return { ...emptyStatus(id, enabled), phase, message: located.message };
    }
    const found = { ...emptyStatus(id, enabled), command: located.command, apiKeyInEnvironment: located.apiKeyInEnvironment };
    // Locating the command runs nothing; only a provider the user turned on is started.
    if (!enabled) return found;
    const probe = await adapters[id].probe({
      executable: located.executable,
      prefixArgs: located.prefixArgs,
      env: located.env,
      cwd: await prepareWorkspace(id),
    });
    return { ...found, ...probe };
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

  async function streamTurn(
    providerId: AiProviderId,
    { system, prompt }: { system: string; prompt: string },
    signal: AbortSignal,
    onDelta: (text: string) => void,
  ) {
    const settings = await options.readSettings();
    const providerSettings = settings.ai.providers[providerId];
    const title = AI_PROVIDER_TITLES[providerId];
    if (!providerSettings.enabled) throw new Error(`Turn on ${title} in Settings › AI before using it.`);
    const launch = await resolveLaunch(providerId, settings);
    if ('error' in launch) throw new Error(launch.error);
    let text = '';
    await adapters[providerId].stream(launch, {
      model: providerSettings.model,
      system,
      prompt,
      signal,
      onDelta: (delta) => {
        text += delta;
        onDelta(delta);
      },
    });
    return text;
  }

  function runTurn(input: AiTurnInput, signal: AbortSignal, onDelta: (text: string) => void) {
    return streamTurn(input.providerId, { system: AI_SYSTEM_PROMPT, prompt: buildAiPrompt(input) }, signal, onDelta);
  }

  function askNotes(input: AskNotesInput, signal: AbortSignal, onDelta: (text: string) => void) {
    return streamTurn(input.providerId, { system: ASK_NOTES_SYSTEM_PROMPT, prompt: buildAskNotesPrompt(input) }, signal, onDelta);
  }

  /** Best effort: a menu opening starts the provider so the first words arrive sooner. */
  async function prewarm(id: AiProviderId) {
    const adapter = adapters[id];
    if (!adapter.prewarm) return;
    const settings = await options.readSettings();
    if (!settings.ai.providers[id].enabled) return;
    const launch = await resolveLaunch(id, settings);
    if ('error' in launch) return;
    await adapter.prewarm(launch).catch(() => undefined);
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

  return { listProviders, refresh, runTurn, askNotes, prewarm, applySettings, dispose };
}
