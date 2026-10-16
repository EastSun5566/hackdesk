import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

import { claudeProvider, claudeTurnArguments, parseClaudeCatalog } from './claude-cli';
import { createFakeCli } from './fake-cli-fixtures';
import { AiTurnCancelledError } from './provider-types';

function turn(overrides: Partial<Parameters<typeof claudeProvider.stream>[1]> = {}) {
  const deltas: string[] = [];
  return {
    deltas,
    input: {
      model: 'haiku',
      system: 'system',
      prompt: 'prompt',
      signal: new AbortController().signal,
      onDelta: (text: string) => deltas.push(text),
      ...overrides,
    },
  };
}

describe('Claude CLI provider', () => {
  it('turns off every tool, hook, skill and MCP server for a text turn', () => {
    const args = claudeTurnArguments('haiku', 'be brief', false);
    expect(args).toEqual(expect.arrayContaining(['-p', '--no-session-persistence', '--disable-slash-commands', '--no-chrome', '--strict-mcp-config']));
    expect(args[args.indexOf('--tools') + 1]).toBe('');
    expect(args[args.indexOf('--disallowedTools') + 1]).toBe('*');
    expect(args[args.indexOf('--max-turns') + 1]).toBe('1');
    expect(args[args.indexOf('--settings') + 1]).toBe('{"disableAllHooks":true}');
    expect(args[args.indexOf('--system-prompt') + 1]).toBe('be brief');
    // `--bare` refuses the claude.ai sign-in that this route reuses.
    expect(args).not.toContain('--bare');
    expect(claudeTurnArguments(null, 's', true)).not.toContain('--strict-mcp-config');
    expect(claudeTurnArguments(null, 's', true)).not.toContain('--model');
  });

  it('lists models once per resolved model and names the plan', () => {
    const output = `${JSON.stringify({ type: 'system' })}\n${JSON.stringify({
      type: 'control_response',
      response: { response: {
        models: [
          { value: 'default', resolvedModel: 'a' },
          { value: 'opus', displayName: 'Opus', resolvedModel: 'a' },
          { value: 'claude-a', displayName: 'Same model', resolvedModel: 'a' },
          { value: 'haiku', displayName: 'Haiku', resolvedModel: 'b' },
        ],
        account: { subscriptionType: 'Claude Pro' },
      } },
    })}\n`;
    expect(parseClaudeCatalog(output)).toEqual({
      models: [
        { id: 'opus', label: 'Opus', isDefault: true },
        { id: 'haiku', label: 'Haiku', isDefault: false },
      ],
      plan: 'Claude Pro',
    });
    expect(parseClaudeCatalog('not json')).toBeNull();
  });

  it('takes the versioned name from the description an API-key sign-in sends', () => {
    const output = JSON.stringify({ type: 'control_response', response: { response: { models: [
      { value: 'sonnet', displayName: 'Sonnet', description: 'Sonnet 5.5 · Efficient for routine tasks · $2/$10 per Mtok', resolvedModel: 's' },
      { value: 'opus', displayName: 'Opus 5.5', description: 'Best for everyday, complex tasks', resolvedModel: 'o' },
      { value: 'bare', resolvedModel: 'b' },
    ] } } });
    expect(parseClaudeCatalog(output)?.models.map(model => model.label)).toEqual(['Sonnet 5.5', 'Opus 5.5', 'bare']);
  });

  it('names an exported API key as the plan when the account has none', async () => {
    const fake = await createFakeCli('claude', { FAKE_NO_ACCOUNT: '1', ANTHROPIC_API_KEY: 'test-key-not-real' });
    expect(await claudeProvider.probe(fake.launch)).toMatchObject({ phase: 'ready', plan: 'API key (ANTHROPIC_API_KEY)' });
  });

  it('probes version, sign-in and models without sending a prompt', async () => {
    const fake = await createFakeCli('claude');
    const status = await claudeProvider.probe(fake.launch);
    expect(status).toMatchObject({ phase: 'ready', version: '2.1.0', plan: 'Claude Max' });
    expect(status.models.map(model => model.id)).toEqual(['opus', 'haiku']);

    const signedOut = await createFakeCli('claude', { FAKE_LOGGED_IN: '0' });
    expect(await claudeProvider.probe(signedOut.launch)).toMatchObject({ phase: 'sign-in-required', models: [] });
  });

  it('streams text deltas and resolves on a successful result', async () => {
    const fake = await createFakeCli('claude');
    const { deltas, input } = turn();
    await claudeProvider.stream(fake.launch, input);
    expect(deltas.join('')).toBe('Hello');
    const recorded = (await readFile(fake.argsFile, 'utf8')).trim().split('\n').map(line => JSON.parse(line) as string[]);
    expect(recorded.at(-1)).toEqual(claudeTurnArguments('haiku', 'system'));
  });

  it('rejects with the CLI explanation when the result is an error', async () => {
    const fake = await createFakeCli('claude', { FAKE_MODE: 'error' });
    await expect(claudeProvider.stream(fake.launch, turn().input)).rejects.toThrow('Not logged in');
  });

  it('declines a tool permission request instead of leaving the CLI waiting', async () => {
    const fake = await createFakeCli('claude', { FAKE_MODE: 'ask' });
    const { deltas, input } = turn();
    await claudeProvider.stream(fake.launch, input);
    expect(deltas.join('')).toBe('answered:error');
  });

  it('stops the CLI when the turn is cancelled', async () => {
    const fake = await createFakeCli('claude', { FAKE_MODE: 'hang' });
    const controller = new AbortController();
    const pending = claudeProvider.stream(fake.launch, turn({ signal: controller.signal }).input);
    setTimeout(() => controller.abort(), 100);
    await expect(pending).rejects.toBeInstanceOf(AiTurnCancelledError);
  });
});
