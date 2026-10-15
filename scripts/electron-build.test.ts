import { beforeEach, describe, expect, it, vi } from 'vitest';
import { build, context, type BuildOptions, type BuildResult, type PluginBuild } from 'esbuild';
import { buildTargets } from './electron-build';

const watchers = vi.hoisted(() => [] as {
  options: BuildOptions;
  finish: (result: BuildResult) => void;
  watch: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
}[]);
vi.mock('esbuild', () => ({
  build: vi.fn(async () => ({ errors: [], warnings: [] })),
  context: vi.fn(async (options: BuildOptions) => {
    let finish!: (result: BuildResult) => void;
    await options.plugins![0].setup({ onEnd: (callback) => { finish = result => { void callback(result); }; } } as PluginBuild);
    const entry = { options, finish, watch: vi.fn(async () => undefined), dispose: vi.fn(async () => undefined) };
    watchers.push(entry);
    return entry;
  }),
}));
const success: BuildResult = { errors: [], warnings: [], outputFiles: undefined, metafile: undefined, mangleCache: undefined };
beforeEach(() => { vi.clearAllMocks(); watchers.length = 0; });

describe('Electron build readiness', () => {
  it('builds each output once outside watch mode', async () => {
    await buildTargets();
    expect(vi.mocked(build).mock.calls.map(([options]) => options!.outfile)).toEqual([
      'electron/dist/main.cjs', 'electron/dist/preload.cjs', 'electron/dist/quick-capture-preload.cjs',
    ]);
    expect(context).not.toHaveBeenCalled();
  });

  it('waits for every first watch build without an extra explicit build, then keeps watching', async () => {
    let ready = false;
    const pending = buildTargets(true).then(() => { ready = true; });
    await vi.waitFor(() => expect(watchers).toHaveLength(3));
    watchers[0].finish(success);
    watchers[1].finish(success);
    await Promise.resolve();
    expect(ready).toBe(false);
    watchers[2].finish(success);
    await pending;
    expect(ready).toBe(true);
    expect(build).not.toHaveBeenCalled();
    expect(watchers.every(entry => entry.watch.mock.calls.length === 1 && !entry.dispose.mock.calls.length)).toBe(true);
    // Later rebuilds keep the existing watchers instead of restarting Electron.
    watchers[0].finish({ ...success, errors: [{ text: 'rebuild error' } as BuildResult['errors'][number]] });
    watchers[0].finish(success);
    expect(context).toHaveBeenCalledTimes(3);
  });

  it('rejects the initial build and disposes all watchers if any output fails', async () => {
    const pending = expect(buildTargets(true)).rejects.toThrow('Initial Electron build failed: electron/dist/preload.cjs');
    await vi.waitFor(() => expect(watchers).toHaveLength(3));
    watchers[0].finish(success);
    watchers[1].finish({ ...success, errors: [{ text: 'invalid source' } as BuildResult['errors'][number]] });
    await pending;
    expect(watchers.every(entry => entry.dispose.mock.calls.length === 1)).toBe(true);
    expect(build).not.toHaveBeenCalled();
  });
});
