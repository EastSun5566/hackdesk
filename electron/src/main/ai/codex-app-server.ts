import type { ChildProcessWithoutNullStreams } from 'node:child_process';

import type { AiModel, AiUsageWindow } from '../../../../src/lib/ai';
import {
  createLineSplitter,
  createStderrTail,
  parseJsonObject,
  parseVersion,
  runCli,
  spawnCli,
  terminate,
} from './cli-process';
import { AiTurnCancelledError, type AiProviderAdapter, type ProviderLaunch, type ProviderProbe, type ProviderTurn } from './provider-types';

type JsonObject = Record<string, unknown>;
type Pending = { resolve: (value: JsonObject) => void; reject: (error: Error) => void; timer: NodeJS.Timeout };
type NotificationListener = (method: string, params: JsonObject) => void;

const MAX_LINE_CHARACTERS = 8 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 15_000;
const TURN_START_TIMEOUT_MS = 60_000;
/** A resident app-server costs memory; a relaunch costs about a second. */
const IDLE_SHUTDOWN_MS = 10 * 60 * 1000;
const DISABLED_FEATURES = [
  'apps', 'plugins', 'remote_plugin', 'plugin_sharing', 'shell_tool', 'unified_exec', 'browser_use',
  'in_app_browser', 'computer_use', 'image_generation', 'multi_agent', 'hooks', 'workspace_dependencies', 'memories',
];

/** Process-scoped overrides; the user's `~/.codex/config.toml` is never written. */
export const CODEX_CONFIG_FLAGS = [
  '-c', 'check_for_update_on_startup=false',
  ...DISABLED_FEATURES.flatMap(feature => ['-c', `features.${feature}=false`]),
];

function asObject(value: unknown): JsonObject | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : null;
}

function asString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function asNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** The user's own MCP servers would otherwise start inside a HackDesk turn and offer their tools. */
export function parseMcpServerNames(listing: string): string[] | null {
  try {
    const value: unknown = JSON.parse(listing);
    if (!Array.isArray(value)) return null;
    const names: string[] = [];
    for (const entry of value) {
      const name = asString(asObject(entry)?.name);
      if (!name) return null;
      names.push(name);
    }
    return names;
  } catch {
    return null;
  }
}

export function codexAppServerArguments(mcpServerNames: string[]) {
  return [
    ...CODEX_CONFIG_FLAGS,
    ...mcpServerNames.flatMap(name => ['-c', `mcp_servers.${name}.enabled=false`]),
    'app-server',
  ];
}

function planLabel(account: JsonObject | null) {
  if (!account) return null;
  if (account.type === 'apiKey') return 'API key';
  if (account.type === 'amazonBedrock') return 'Amazon Bedrock';
  const plan = asString(account.planType);
  if (!plan) return 'ChatGPT';
  return `ChatGPT ${plan.charAt(0).toUpperCase()}${plan.slice(1)}`;
}

export function parseUsageWindow(value: unknown): AiUsageWindow | null {
  const window = asObject(value);
  const usedPercent = asNumber(window?.usedPercent);
  if (!window || usedPercent === null) return null;
  return {
    usedPercent: Math.min(100, Math.max(0, usedPercent)),
    windowMinutes: asNumber(window.windowDurationMins),
    resetsAt: asNumber(window.resetsAt),
  };
}

export function parseCodexModels(response: JsonObject): AiModel[] {
  const data = Array.isArray(response.data) ? response.data : [];
  return data.map(asObject).flatMap((model) => {
    const id = asString(model?.model) ?? asString(model?.id);
    if (!model || !id || model.hidden === true) return [];
    return [{ id, label: asString(model.displayName) ?? id, isDefault: model.isDefault === true }];
  });
}

export class CodexAppServerClient {
  private child: ChildProcessWithoutNullStreams | null = null;
  private launchKey = '';
  private starting: Promise<void> | null = null;
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();
  private readonly listeners = new Set<NotificationListener>();
  private idleTimer: NodeJS.Timeout | null = null;
  private activeTurns = 0;
  private stderr = createStderrTail();

  constructor(private readonly clientVersion: string) {}

  async ensureStarted(launch: ProviderLaunch) {
    const key = `${launch.executable}\0${launch.cwd}`;
    while (this.starting) await this.starting.catch(() => undefined);
    if (this.child && this.launchKey === key) return;
    this.stop();
    this.starting = this.launch(launch, key);
    try {
      await this.starting;
    } finally {
      this.starting = null;
    }
  }

  private async launch(launch: ProviderLaunch, key: string) {
    const listing = await runCli(launch.executable, [...CODEX_CONFIG_FLAGS, 'mcp', 'list', '--json'], launch);
    const names = listing.code === 0 ? parseMcpServerNames(listing.stdout) : null;
    if (!names) {
      throw new Error('HackDesk could not read which MCP servers your Codex configuration runs, so it did not start Codex. Run `codex mcp list` in a terminal to see why.');
    }
    const unaddressable = names.find(name => name.includes('.') || name.includes('='));
    if (unaddressable) {
      throw new Error(`Your Codex MCP server "${unaddressable}" cannot be switched off for HackDesk because its name contains "." or "=". Rename it in your Codex configuration.`);
    }

    this.stderr = createStderrTail();
    const child = spawnCli(launch.executable, codexAppServerArguments(names), launch);
    this.child = child;
    this.launchKey = key;
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', createLineSplitter(MAX_LINE_CHARACTERS, line => this.handleLine(child, line), () => {
      this.fail(child, 'Codex returned an oversized message.');
    }));
    child.stderr.on('data', (chunk: string) => this.stderr.push(chunk));
    child.stdin.on('error', () => undefined);
    child.on('error', error => this.fail(child, `Codex could not start: ${error.message}`));
    child.on('close', code => this.fail(child, this.stderr.text || `Codex exited with status ${code ?? 'unknown'}.`));

    try {
      await this.request('initialize', {
        clientInfo: { name: 'hackdesk', title: 'HackDesk', version: this.clientVersion },
        capabilities: null,
      });
      this.send({ method: 'initialized', params: {} });
    } catch (error) {
      this.stop();
      throw error;
    }
    this.scheduleIdleStop();
  }

  request(method: string, params: JsonObject = {}, timeoutMs = REQUEST_TIMEOUT_MS): Promise<JsonObject> {
    const child = this.child;
    if (!child) return Promise.reject(new Error('Codex is not running.'));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('Codex did not respond in time.'));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.send({ id, method, params });
    });
  }

  onNotification(listener: NotificationListener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Keeps the server alive while a turn runs; the idle timer only counts quiet time. */
  holdForTurn() {
    this.activeTurns += 1;
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = null;
    return () => {
      this.activeTurns = Math.max(0, this.activeTurns - 1);
      this.scheduleIdleStop();
    };
  }

  stop() {
    const child = this.child;
    this.child = null;
    this.launchKey = '';
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = null;
    this.rejectPending(new Error('Codex stopped.'));
    if (child) {
      child.stdin.end();
      terminate(child);
    }
  }

  private scheduleIdleStop() {
    if (this.activeTurns > 0 || !this.child) return;
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => this.stop(), IDLE_SHUTDOWN_MS);
    this.idleTimer.unref();
  }

  private send(message: JsonObject) {
    if (this.child?.stdin.writable) this.child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  private fail(child: ChildProcessWithoutNullStreams, message: string) {
    if (this.child !== child) return;
    this.child = null;
    this.launchKey = '';
    this.rejectPending(new Error(message));
    for (const listener of this.listeners) listener('hackdesk/exited', { message });
    terminate(child);
  }

  private rejectPending(error: Error) {
    for (const entry of this.pending.values()) {
      clearTimeout(entry.timer);
      entry.reject(error);
    }
    this.pending.clear();
  }

  private handleLine(child: ChildProcessWithoutNullStreams, line: string) {
    if (this.child !== child) return;
    const message = parseJsonObject(line);
    if (!message) return;
    const method = asString(message.method);
    const hasId = typeof message.id === 'number' || typeof message.id === 'string';
    if (method && hasId) {
      this.declineServerRequest(message.id as number | string, method);
      return;
    }
    if (method) {
      const params = asObject(message.params) ?? {};
      for (const listener of this.listeners) listener(method, params);
      return;
    }
    if (typeof message.id !== 'number') return;
    const entry = this.pending.get(message.id);
    if (!entry) return;
    this.pending.delete(message.id);
    clearTimeout(entry.timer);
    const error = asObject(message.error);
    if (error) entry.reject(new Error(asString(error.message) ?? 'Codex rejected the request.'));
    else entry.resolve(asObject(message.result) ?? {});
  }

  /** HackDesk offers Codex no tools, so every approval or question it asks is turned down. */
  private declineServerRequest(id: number | string, method: string) {
    let result: JsonObject | null = null;
    if (method === 'item/commandExecution/requestApproval' || method === 'item/fileChange/requestApproval') {
      result = { decision: 'cancel' };
    } else if (method === 'item/permissions/requestApproval') {
      result = { permissions: { fileSystem: { entries: [] }, network: { enabled: false } } };
    } else if (method === 'item/tool/requestUserInput') {
      result = { answers: {} };
    } else if (method === 'mcpServer/elicitation/request') {
      result = { action: 'decline' };
    }
    if (result) this.send({ id, result });
    else this.send({ id, error: { code: -32601, message: 'HackDesk does not expose Codex tools.' } });
  }
}

export function createCodexProvider(clientVersion: string): AiProviderAdapter {
  const client = new CodexAppServerClient(clientVersion);

  async function probe(launch: ProviderLaunch, signal?: AbortSignal): Promise<ProviderProbe> {
    const base = { version: null, plan: null, models: [], usage: null };
    const versionResult = await runCli(launch.executable, ['--version'], { ...launch, signal });
    if (versionResult.code !== 0) {
      return { ...base, phase: 'failed', message: versionResult.stderr || 'Codex did not report its version.' };
    }
    const version = parseVersion(versionResult.stdout);
    try {
      await client.ensureStarted(launch);
      const accountResponse = await client.request('account/read', { refreshToken: false });
      const account = asObject(accountResponse.account);
      if (!account) {
        return { ...base, version, phase: 'sign-in-required', message: 'Run `codex login` in a terminal, then refresh.' };
      }
      const models = parseCodexModels(await client.request('model/list', { includeHidden: false, limit: 100 }));
      let usage: ProviderProbe['usage'] = null;
      try {
        const limits = asObject((await client.request('account/rateLimits/read')).rateLimits);
        if (limits) usage = { primary: parseUsageWindow(limits.primary), secondary: parseUsageWindow(limits.secondary) };
      } catch {
        // An API-key account has no subscription windows; the provider still works.
      }
      return {
        version,
        phase: models.length > 0 ? 'ready' : 'failed',
        message: models.length > 0 ? null : 'Codex listed no models. Update Codex, then refresh.',
        plan: planLabel(account),
        models,
        usage,
      };
    } catch (error) {
      return { ...base, version, phase: 'failed', message: error instanceof Error ? error.message : String(error) };
    }
  }

  async function stream(launch: ProviderLaunch, turn: ProviderTurn) {
    if (turn.signal.aborted) throw new AiTurnCancelledError();
    await client.ensureStarted(launch);
    const release = client.holdForTurn();
    let threadId: string | null = null;
    let turnId: string | null = null;
    let unsubscribe = () => false;
    let removeAbortListener: () => void = () => undefined;
    try {
      const thread = await client.request('thread/start', {
        ...(turn.model ? { model: turn.model } : {}),
        cwd: launch.cwd,
        approvalPolicy: 'never',
        sandbox: 'read-only',
        ephemeral: true,
        config: { web_search: 'disabled' },
        developerInstructions: turn.system,
      });
      threadId = asString(asObject(thread.thread)?.id);
      if (!threadId) throw new Error('Codex returned no conversation thread.');
      const currentThread = threadId;

      const completion = new Promise<void>((resolve, reject) => {
        const abort = () => reject(new AiTurnCancelledError());
        turn.signal.addEventListener('abort', abort, { once: true });
        removeAbortListener = () => turn.signal.removeEventListener('abort', abort);
        unsubscribe = client.onNotification((method, params) => {
          if (method === 'hackdesk/exited') {
            reject(new Error(asString(params.message) ?? 'Codex stopped.'));
            return;
          }
          if (params.threadId !== currentThread) return;
          if (method === 'item/agentMessage/delta' && typeof params.delta === 'string') {
            turn.onDelta(params.delta);
          } else if (method === 'error' && params.willRetry !== true) {
            reject(new Error(asString(asObject(params.error)?.message) ?? 'Codex could not finish the response.'));
          } else if (method === 'turn/completed') {
            const completed = asObject(params.turn);
            if (completed?.status === 'completed') resolve();
            else reject(new Error(asString(asObject(completed?.error)?.message) ?? 'Codex could not finish the response.'));
          }
        });
      });
      // Registered before turn/start so no early delta is missed; awaited together so neither rejection goes unhandled.
      const started = client.request('turn/start', {
        threadId,
        input: [{ type: 'text', text: turn.prompt, text_elements: [] }],
        approvalPolicy: 'never',
        sandboxPolicy: { type: 'readOnly', networkAccess: false },
      }, TURN_START_TIMEOUT_MS).then((response) => {
        turnId = asString(asObject(response.turn)?.id);
        // Cancelled while the turn was starting: stop it now that it can be named.
        if (turn.signal.aborted && turnId) {
          client.request('turn/interrupt', { threadId: currentThread, turnId }).catch(() => undefined);
        }
      });
      await Promise.all([started, completion]);
    } catch (error) {
      if (threadId && turnId) {
        client.request('turn/interrupt', { threadId, turnId }).catch(() => undefined);
      }
      throw error;
    } finally {
      unsubscribe();
      removeAbortListener();
      release();
    }
  }

  return {
    probe,
    stream,
    prewarm: async (launch) => {
      await client.ensureStarted(launch);
    },
    dispose: () => client.stop(),
  };
}
