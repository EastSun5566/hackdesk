import { _electron, expect, test } from '@playwright/test';
import { build } from 'esbuild';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { electronBundleOptions } from '../../scripts/electron-bundle';

test('bundled updater checks a local feed without npm files or downloads', async () => {
  const home = await mkdtemp(join(tmpdir(), 'hackdesk-bundled-updater-'));
  let electron: Awaited<ReturnType<typeof _electron.launch>> | undefined;
  try {
    await build({ ...electronBundleOptions, entryPoints: [resolve(import.meta.dirname, 'fixtures/bundled-updater.ts')], outfile: join(home, 'main.cjs'), sourcemap: false });
    await writeFile(join(home, 'package.json'), JSON.stringify({ name: 'updater-fixture', version: '1.0.0', main: 'main.cjs' }));
    electron = await _electron.launch({
      args: [...(process.platform === 'linux' ? ['--no-sandbox'] : []), home, `--user-data-dir=${join(home, 'user-data')}`],
      env: { ...process.env, HOME: home, XDG_CONFIG_HOME: home, XDG_CACHE_HOME: home, APPDATA: home, LOCALAPPDATA: home },
    });
    const result = await electron.evaluate(async () => await (globalThis as unknown as { updaterResult: Promise<Record<string, unknown>> }).updaterResult);
    expect(result).toMatchObject({ version: '999.0.0', notes: 'Local YAML fixture', available: true, download: null, blocked: [] });
    expect(result.requests).toEqual([expect.stringMatching(/^\/latest.*\.yml$/)]);
  } finally {
    await electron?.close();
    await rm(home, { recursive: true, force: true });
  }
});
