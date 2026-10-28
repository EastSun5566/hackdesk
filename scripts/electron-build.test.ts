import { beforeEach, describe, expect, it, vi } from 'vitest';
import { build, context, type BuildOptions, type BuildResult, type PluginBuild } from 'esbuild';
import { buildTargets } from './electron-build';

vi.mock('./third-party-notices.ts', () => ({ writeThirdPartyNotices: vi.fn() }));

const watchers = vi.hoisted(() => [] as {
  options: BuildOptions;
  finish: (result: BuildResult) => void;
  watch: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
}[]);
vi.mock('esbuild', () => ({
  build: vi.fn(async () => ({ errors: [], warnings: [] })),
  context: vi.fn(async (options: BuildOptions) => {
    const callbacks: ((result: BuildResult) => unknown)[] = [];
    for (const plugin of options.plugins!) await plugin.setup({ onEnd: callback => { callbacks.push(callback); } } as PluginBuild);
    const finish = (result: BuildResult) => {
      for (const callback of callbacks) {
        const extra = callback(result) as { errors?: BuildResult['errors'] } | undefined;
        if (extra?.errors) result.errors.push(...extra.errors);
      }
    };
    const entry = { options, finish, watch: vi.fn(async () => undefined), dispose: vi.fn(async () => undefined) };
    watchers.push(entry);
    return entry;
  }),
}));
const success: BuildResult = { errors: [], warnings: [], outputFiles: undefined, metafile: { inputs: {}, outputs: {} }, mangleCache: undefined };
beforeEach(() => { vi.clearAllMocks(); watchers.length = 0; });

describe('Electron build readiness', () => {
  it('builds each output once outside watch mode', async () => {
    await buildTargets();
    expect(vi.mocked(build).mock.calls.map(([options]) => options!.outfile)).toEqual([
      'electron/dist/main.cjs', 'electron/dist/preload.cjs', 'electron/dist/quick-capture-preload.cjs',
      'electron/dist/presentation-preload.cjs',
    ]);
    expect(context).not.toHaveBeenCalled();
  });

  it('waits for every first watch build without an extra explicit build, then keeps watching', async () => {
    let ready = false;
    const pending = buildTargets(true).then(() => { ready = true; });
    await vi.waitFor(() => expect(watchers).toHaveLength(4));
    watchers[0].finish({ ...success, errors: [] });
    watchers[1].finish(success);
    await Promise.resolve();
    expect(ready).toBe(false);
    watchers[2].finish(success);
    watchers[3].finish(success);
    await pending;
    expect(ready).toBe(true);
    expect(build).not.toHaveBeenCalled();
    expect(watchers.every(entry => entry.watch.mock.calls.length === 1 && !entry.dispose.mock.calls.length)).toBe(true);
    // Later rebuilds keep the existing watchers instead of restarting Electron.
    watchers[0].finish({ ...success, errors: [{ text: 'rebuild error' } as BuildResult['errors'][number]] });
    watchers[0].finish({ ...success, errors: [] });
    expect(context).toHaveBeenCalledTimes(4);
  });

  it('rejects an unbundled package before announcing watch readiness', async () => {
    const pending = expect(buildTargets(true)).rejects.toThrow('Initial Electron build failed');
    await vi.waitFor(() => expect(watchers).toHaveLength(4));
    watchers[0].finish({ ...success, errors: [], metafile: {
      inputs: {}, outputs: { 'main.cjs': { imports: [{ path: 'missing-package', external: true, kind: 'require-call' }], exports: [], inputs: {}, bytes: 1 } },
    } });
    await pending;
    expect(watchers.every(entry => entry.dispose.mock.calls.length === 1)).toBe(true);
  });

  it('rejects the initial build and disposes all watchers if any output fails', async () => {
    const pending = expect(buildTargets(true)).rejects.toThrow('Initial Electron build failed: electron/dist/preload.cjs');
    await vi.waitFor(() => expect(watchers).toHaveLength(4));
    watchers[0].finish({ ...success, errors: [] });
    watchers[1].finish({ ...success, errors: [{ text: 'invalid source' } as BuildResult['errors'][number]] });
    await pending;
    expect(watchers.every(entry => entry.dispose.mock.calls.length === 1)).toBe(true);
    expect(build).not.toHaveBeenCalled();
  });
});
