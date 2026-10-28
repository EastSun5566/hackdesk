import { mkdtemp, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { defaultSettings, type AppSettings } from '../../../../src/lib/settings';
import { createAiService } from './ai-service';
import { createFakeCli } from './fake-cli-fixtures';
import type { AiProviderAdapter } from './provider-types';

function settingsWith(patch: Partial<AppSettings['ai']['providers']['claude']>): AppSettings {
  return {
    ...defaultSettings,
    ai: { ...defaultSettings.ai, providers: { ...defaultSettings.ai.providers, claude: { ...defaultSettings.ai.providers.claude, ...patch } } },
  };
}

function adapter(): AiProviderAdapter {
  return {
    probe: vi.fn(async () => ({ phase: 'ready' as const, message: null, version: '1', plan: null, models: [], usage: null })),
    stream: vi.fn(async (_launch, turn) => turn.onDelta('result')),
    dispose: vi.fn(),
  };
}

async function setup(settings: AppSettings, env: NodeJS.ProcessEnv = {}) {
  const fake = await createFakeCli('claude');
  const claude = adapter();
  const codex = adapter();
  const rootPath = await mkdtemp(join(tmpdir(), 'hackdesk-ai-root-'));
  const service = createAiService({
    appVersion: '1.0.0',
    rootPath,
    readSettings: async () => settings,
    adapters: { claude, codex },
    locator: { env: { PATH: dirname(fake.executable), ...env }, platform: process.platform, home: '/nonexistent', loginShellPath: async () => null },
  });
  return { service, claude, codex, rootPath };
}

describe('AI service', () => {
  it('locates a provider that is off without running it', async () => {
    const { service, claude } = await setup(settingsWith({ enabled: false }));
    const status = await service.refresh('claude');
    expect(status).toMatchObject({ id: 'claude', enabled: false, phase: 'idle' });
    expect(status.command).toMatch(/claude$/);
    expect(claude.probe).not.toHaveBeenCalled();
  });

  it('probes an enabled provider inside a private workspace', async () => {
    const { service, claude, rootPath } = await setup(settingsWith({ enabled: true }));
    expect(await service.refresh('claude')).toMatchObject({ enabled: true, phase: 'ready', version: '1' });
    const launch = vi.mocked(claude.probe).mock.calls[0]![0];
    expect(launch.cwd).toBe(join(rootPath, 'claude', 'workspace'));
    if (process.platform !== 'win32') expect((await stat(launch.cwd)).mode & 0o777).toBe(0o700);
  });

  it('refuses a turn for a provider that is off and passes the chosen model otherwise', async () => {
    const off = await setup(settingsWith({ enabled: false }));
    await expect(off.service.runTurn({ requestId: 'r', providerId: 'claude', action: 'summarize', text: 'x' }, new AbortController().signal, () => undefined))
      .rejects.toThrow('Turn on Claude');
    expect(off.claude.stream).not.toHaveBeenCalled();

    const on = await setup(settingsWith({ enabled: true, model: 'haiku' }));
    const deltas: string[] = [];
    const text = await on.service.runTurn({ requestId: 'r', providerId: 'claude', action: 'translate', targetLanguage: 'French', text: 'hello' }, new AbortController().signal, d => deltas.push(d));
    expect(text).toBe('result');
    expect(deltas).toEqual(['result']);
    const turn = vi.mocked(on.claude.stream).mock.calls[0]![1];
    expect(turn.model).toBe('haiku');
    expect(turn.prompt).toContain('Translate the selection into French');
    expect(turn.prompt).toContain('<selection>\nhello\n</selection>');
  });

  it('answers questions about notes with their own instructions and numbered sources', async () => {
    const { service, claude } = await setup(settingsWith({ enabled: true }));
    const text = await service.askNotes({
      requestId: 'r',
      providerId: 'claude',
      question: '結論是什麼？',
      sources: [{ title: '週會', text: '結論：先做離線閱讀。' }],
      history: [],
    }, new AbortController().signal, () => undefined);
    expect(text).toBe('result');
    const turn = vi.mocked(claude.stream).mock.calls[0]![1];
    expect(turn.system).toContain('Answer only from the text inside <source> tags');
    expect(turn.prompt).toContain('<source id="1" title="週會">\n結論：先做離線閱讀。\n</source>');
  });

  it('can run Claude without an exported API key so the claude.ai sign-in is used', async () => {
    const env = { ANTHROPIC_API_KEY: 'test-key-not-real', ANTHROPIC_AUTH_TOKEN: 'test-token-not-real', KEEP: '1' };
    const keep = await setup(settingsWith({ enabled: true }), env);
    expect(await keep.service.refresh('claude')).toMatchObject({ apiKeyInEnvironment: true });
    expect(vi.mocked(keep.claude.probe).mock.calls[0]![0].env.ANTHROPIC_API_KEY).toBe('test-key-not-real');

    const ignore = await setup(settingsWith({ enabled: true, ignoreApiKey: true }), env);
    expect(await ignore.service.refresh('claude')).toMatchObject({ apiKeyInEnvironment: true });
    const launched = vi.mocked(ignore.claude.probe).mock.calls[0]![0].env;
    expect(launched.ANTHROPIC_API_KEY).toBeUndefined();
    expect(launched.ANTHROPIC_AUTH_TOKEN).toBeUndefined();
    expect(launched.KEEP).toBe('1');
  });

  it('stops a provider process when the provider is switched off', async () => {
    const { service, claude, codex } = await setup(settingsWith({ enabled: true }));
    service.applySettings(settingsWith({ enabled: true }).ai);
    expect(claude.dispose).not.toHaveBeenCalled();
    expect(codex.dispose).toHaveBeenCalledOnce();
  });
});
