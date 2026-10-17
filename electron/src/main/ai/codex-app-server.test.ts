import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { codexAppServerArguments, createCodexProvider, parseCodexModels, parseMcpServerNames, parseUsageWindow } from './codex-app-server';
import { createFakeCli } from './fake-cli-fixtures';
import type { AiProviderAdapter } from './provider-types';

const providers: AiProviderAdapter[] = [];

function provider() {
  const created = createCodexProvider('1.0.0');
  providers.push(created);
  return created;
}

afterEach(() => {
  for (const created of providers.splice(0)) created.dispose?.();
});

describe('Codex app-server provider', () => {
  it('switches off features and every MCP server of the user before starting', () => {
    const args = codexAppServerArguments(['mine', 'other']);
    expect(args.at(-1)).toBe('app-server');
    expect(args).toEqual(expect.arrayContaining([
      'features.shell_tool=false',
      'features.plugins=false',
      'mcp_servers.mine.enabled=false',
      'mcp_servers.other.enabled=false',
    ]));
  });

  it('parses MCP listings, models and usage windows defensively', () => {
    expect(parseMcpServerNames('[{"name":"a"},{"name":"b"}]')).toEqual(['a', 'b']);
    expect(parseMcpServerNames('[{"nope":1}]')).toBeNull();
    expect(parseMcpServerNames('oops')).toBeNull();
    expect(parseCodexModels({ data: [{ model: 'a', displayName: 'A', isDefault: true }, { model: 'b', hidden: true }] }))
      .toEqual([{ id: 'a', label: 'A', isDefault: true }]);
    expect(parseUsageWindow({ usedPercent: 120, windowDurationMins: 300, resetsAt: 1 })).toEqual({ usedPercent: 100, windowMinutes: 300, resetsAt: 1 });
    expect(parseUsageWindow(null)).toBeNull();
  });

  it('reports plan, visible models and usage from the signed-in account', async () => {
    const fake = await createFakeCli('codex');
    const status = await provider().probe(fake.launch);
    expect(status).toEqual({
      phase: 'ready',
      message: null,
      version: '0.200.0',
      plan: 'ChatGPT Plus',
      models: [{ id: 'gpt-test', label: 'GPT Test', isDefault: true }],
      usage: { primary: { usedPercent: 85, windowMinutes: 300, resetsAt: 2000000000 }, secondary: null },
    });
    const launches = (await readFile(fake.argsFile, 'utf8')).trim().split('\n').map(line => JSON.parse(line) as string[]);
    expect(launches.find(args => args.at(-1) === 'app-server')).toContain('mcp_servers.mine.enabled=false');
  });

  it('starts a script under Node when the launch has prefix arguments', async () => {
    const fake = await createFakeCli('codex');
    const launch = { ...fake.launch, executable: process.execPath, prefixArgs: [fake.executable] };
    expect(await provider().probe(launch)).toMatchObject({ phase: 'ready', plan: 'ChatGPT Plus' });
  });

  it('asks a signed-out user to run codex login', async () => {
    const fake = await createFakeCli('codex', { FAKE_SIGNED_OUT: '1' });
    expect(await provider().probe(fake.launch)).toMatchObject({ phase: 'sign-in-required', models: [] });
  });

  it('refuses to start when a user MCP server cannot be switched off', async () => {
    const fake = await createFakeCli('codex', { FAKE_MCP: '[{"name":"a.b"}]' });
    expect(await provider().probe(fake.launch)).toMatchObject({ phase: 'failed', message: expect.stringContaining('"a.b"') });
  });

  it('streams a read-only, ephemeral turn and declines command approvals', async () => {
    const fake = await createFakeCli('codex');
    const approvalFile = join(fake.directory, 'approval.json');
    const threadFile = join(fake.directory, 'thread.json');
    fake.launch.env = { ...fake.launch.env, FAKE_APPROVAL_FILE: approvalFile, FAKE_THREAD_FILE: threadFile };
    const deltas: string[] = [];
    await provider().stream(fake.launch, {
      model: 'gpt-test',
      system: 'system',
      prompt: 'prompt',
      signal: new AbortController().signal,
      onDelta: text => deltas.push(text),
    });
    expect(deltas.join('')).toBe('Bonjour');
    expect(JSON.parse(await readFile(threadFile, 'utf8'))).toMatchObject({
      model: 'gpt-test',
      approvalPolicy: 'never',
      sandbox: 'read-only',
      ephemeral: true,
      developerInstructions: 'system',
    });
    expect(JSON.parse(await readFile(approvalFile, 'utf8'))).toEqual({ id: 'srv-1', result: { decision: 'cancel' } });
  });

  it('rejects with the turn error when Codex does not complete', async () => {
    const fake = await createFakeCli('codex', { FAKE_TURN_STATUS: 'failed' });
    await expect(provider().stream(fake.launch, {
      model: null,
      system: 's',
      prompt: 'p',
      signal: new AbortController().signal,
      onDelta: () => undefined,
    })).rejects.toThrow('Usage limit reached');
  });

  it.skipIf(process.platform === 'win32')('fails a turn soon after Codex exits while a background process holds its output', async () => {
    const fake = await createFakeCli('codex', { FAKE_MODE: 'orphan' });
    const started = Date.now();
    await expect(provider().stream(fake.launch, {
      model: null,
      system: 's',
      prompt: 'p',
      signal: new AbortController().signal,
      onDelta: () => undefined,
    })).rejects.toThrow('crashed mid-turn');
    expect(Date.now() - started).toBeLessThan(4_000);
  });
});
