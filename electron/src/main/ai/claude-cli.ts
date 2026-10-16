import { existsSync } from 'node:fs';

import type { AiModel } from '../../../../src/lib/ai';
import {
  cleanCliMessage,
  createLineSplitter,
  createStderrTail,
  parseJsonObject,
  parseVersion,
  runCli,
  spawnCli,
  terminate,
} from './cli-process';
import { AiTurnCancelledError, type AiProviderAdapter, type ProviderLaunch, type ProviderProbe, type ProviderTurn } from './provider-types';

const MAX_LINE_CHARACTERS = 8 * 1024 * 1024;
const MODEL_REQUEST_ID = 'hackdesk-models';
const MANAGED_MCP_PATHS: Partial<Record<NodeJS.Platform, string>> = {
  darwin: '/Library/Application Support/ClaudeCode/managed-mcp.json',
  linux: '/etc/claude-code/managed-mcp.json',
  win32: 'C:\\Program Files\\ClaudeCode\\managed-mcp.json',
};
const MANAGED_MCP_PATH = MANAGED_MCP_PATHS[process.platform] ?? '';

type JsonObject = Record<string, unknown>;

function asObject(value: unknown): JsonObject | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : null;
}

function asString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/** An administrator's managed MCP policy makes Claude reject `--strict-mcp-config`. */
function withoutMcpArguments(hasManagedMcp = existsSync(MANAGED_MCP_PATH)) {
  return hasManagedMcp ? [] : ['--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}'];
}

/** Shared by the probe and turns: stream-json both ways, nothing persisted, no hooks or MCP servers. */
function sessionArguments(hasManagedMcp?: boolean) {
  return [
    '-p',
    '--input-format', 'stream-json',
    '--output-format', 'stream-json',
    '--verbose',
    '--no-session-persistence',
    // The user's hooks would otherwise run on every HackDesk request.
    '--settings', '{"disableAllHooks":true}',
    ...withoutMcpArguments(hasManagedMcp),
  ];
}

/**
 * Text generation only: every tool, skill and integration is off and the turn is one request.
 * `--bare` is deliberately absent because it refuses the claude.ai sign-in this route reuses.
 */
export function claudeTurnArguments(model: string | null, system: string, hasManagedMcp?: boolean) {
  return [
    ...sessionArguments(hasManagedMcp),
    ...(model ? ['--model', model] : []),
    '--include-partial-messages',
    '--disable-slash-commands',
    '--no-chrome',
    '--tools', '',
    '--disallowedTools', '*',
    '--max-turns', '1',
    '--system-prompt', system,
  ];
}

export function claudeUserMessage(prompt: string) {
  return `${JSON.stringify({ type: 'user', message: { role: 'user', content: prompt } })}\n`;
}

function planLabel(account: JsonObject | null) {
  if (!account) return null;
  const provider = asString(account.apiProvider);
  if (provider && provider !== 'firstParty') return provider;
  // Reported as "pro", "claude_max" or "Claude Pro" depending on the CLI version.
  const tier = asString(account.subscriptionType)?.replace(/^claude[\s_-]*/i, '').replace(/[_-]+/g, ' ').trim();
  if (!tier) return null;
  return `Claude ${tier.charAt(0).toUpperCase()}${tier.slice(1)}`;
}

/**
 * Signed in with an API key, `displayName` is only the family ("Sonnet") while `description`
 * starts with the versioned name ("Sonnet 5.5 · Efficient for routine tasks"); prefer that part.
 */
function claudeModelLabel(entry: JsonObject, id: string) {
  const description = asString(entry.description);
  const versioned = description?.includes(' · ') ? description.split(' · ')[0]!.trim() : null;
  return versioned || asString(entry.displayName) || id;
}

/** Reads the `initialize` control response: the model catalog and the signed-in plan. */
export function parseClaudeCatalog(output: string): { models: AiModel[]; plan: string | null } | null {
  for (const line of output.split('\n')) {
    const object = parseJsonObject(line.trim());
    if (object?.type !== 'control_response') continue;
    const payload = asObject(asObject(object.response)?.response);
    if (!payload || !Array.isArray(payload.models)) continue;
    const entries = payload.models.map(asObject).filter((entry): entry is JsonObject => entry !== null);
    const defaultTarget = entries.find(entry => entry.value === 'default');
    const defaultModel = asString(defaultTarget?.resolvedModel);
    const seen = new Set<string>();
    const models: AiModel[] = [];
    for (const entry of entries) {
      const id = asString(entry.value);
      if (!id || id === 'default') continue;
      const target = asString(entry.resolvedModel) ?? id;
      if (seen.has(target)) continue;
      seen.add(target);
      models.push({
        id,
        label: claudeModelLabel(entry, id),
        isDefault: target === defaultModel,
      });
    }
    return { models, plan: planLabel(asObject(payload.account)) };
  }
  return null;
}

function isLoggedIn(output: string) {
  const status = parseJsonObject(output.trim());
  if (!status) return null;
  return status.loggedIn === true || status.authenticated === true;
}

async function probe(launch: ProviderLaunch, signal?: AbortSignal): Promise<ProviderProbe> {
  const base = { version: null, plan: null, models: [], usage: null };
  const versionResult = await runCli(launch.executable, ['--version'], { ...launch, signal });
  if (versionResult.code !== 0) {
    return { ...base, phase: 'failed', message: versionResult.stderr || 'Claude Code did not report its version.' };
  }
  const version = parseVersion(versionResult.stdout);
  const auth = await runCli(launch.executable, ['auth', 'status', '--json'], { ...launch, signal });
  if (isLoggedIn(auth.stdout) === false) {
    return { ...base, version, phase: 'sign-in-required', message: 'Run `claude auth login` in a terminal, then refresh.' };
  }
  // No prompt follows the request, so the CLI answers it and exits without calling a model.
  const catalog = await runCli(launch.executable, sessionArguments(), {
    ...launch,
    signal,
    timeoutMs: 30_000,
    input: `${JSON.stringify({ type: 'control_request', request_id: MODEL_REQUEST_ID, request: { subtype: 'initialize' } })}\n`,
  });
  const parsed = parseClaudeCatalog(catalog.stdout);
  if (!parsed || parsed.models.length === 0) {
    return { ...base, version, phase: 'failed', message: catalog.stderr || 'Claude Code listed no models. Update Claude Code, then refresh.' };
  }
  // An exported ANTHROPIC_API_KEY wins over the claude.ai sign-in, so say which one pays.
  const plan = parsed.plan ?? (launch.env.ANTHROPIC_API_KEY ? 'API key (ANTHROPIC_API_KEY)' : null);
  return { ...base, version, phase: 'ready', message: null, models: parsed.models, plan };
}

function resultError(object: JsonObject) {
  const result = asString(object.result);
  if (result) return result;
  const errors = Array.isArray(object.errors) ? object.errors.filter(item => typeof item === 'string') : [];
  return errors.join('\n') || 'Claude Code could not finish the response.';
}

function stream(launch: ProviderLaunch, turn: ProviderTurn): Promise<void> {
  return new Promise((resolve, reject) => {
    if (turn.signal.aborted) {
      reject(new AiTurnCancelledError());
      return;
    }
    const child = spawnCli(launch.executable, claudeTurnArguments(turn.model, turn.system), launch);
    const stderr = createStderrTail();
    let streamedText = false;
    let settled = false;
    const settle = (error?: Error) => {
      if (settled) return;
      settled = true;
      turn.signal.removeEventListener('abort', abort);
      // A stream-json turn is answered; closing stdin is what lets the CLI exit.
      child.stdin.end();
      if (error) {
        terminate(child);
        reject(error);
      } else {
        resolve();
      }
    };
    const abort = () => settle(new AiTurnCancelledError());
    turn.signal.addEventListener('abort', abort, { once: true });

    const write = (line: string) => {
      if (!child.stdin.writable) return;
      child.stdin.write(line);
    };
    const handleLine = (line: string) => {
      const object = parseJsonObject(line);
      if (!object || settled) return;
      if (object.type === 'stream_event') {
        const event = asObject(object.event);
        const delta = asObject(event?.delta);
        if (event?.type === 'content_block_delta' && delta?.type === 'text_delta' && typeof delta.text === 'string') {
          streamedText = true;
          turn.onDelta(delta.text);
        }
        return;
      }
      if (object.type === 'control_request') {
        // No tool is offered, so any question the CLI asks is declined rather than left hanging.
        const requestId = asString(object.request_id);
        if (requestId) {
          write(`${JSON.stringify({ type: 'control_response', response: { subtype: 'error', request_id: requestId, error: 'HackDesk does not allow tools.' } })}\n`);
        }
        return;
      }
      if (object.type === 'result') {
        if (object.is_error === true || object.subtype !== 'success') {
          settle(new Error(resultError(object)));
          return;
        }
        const result = typeof object.result === 'string' ? object.result : '';
        if (!streamedText && result) turn.onDelta(result);
        settle();
      }
    };

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', createLineSplitter(MAX_LINE_CHARACTERS, handleLine, () => {
      settle(new Error('Claude Code returned an oversized response.'));
    }));
    child.stderr.on('data', (chunk: string) => stderr.push(chunk));
    child.stdin.on('error', () => undefined);
    child.on('error', error => settle(new Error(`Claude Code could not start: ${error.message}`)));
    child.on('close', (code) => {
      settle(new Error(cleanCliMessage(stderr.text) || `Claude Code exited with status ${code ?? 'unknown'}.`));
    });
    write(claudeUserMessage(turn.prompt));
  });
}

export const claudeProvider: AiProviderAdapter = { probe, stream };
