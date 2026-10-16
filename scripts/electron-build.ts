import { build, context, type BuildContext, type BuildOptions } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { electronBundleOptions } from './electron-bundle.ts';
import { writeThirdPartyNotices } from './third-party-notices.ts';

const isWatch = process.argv.includes('--watch');
const common = electronBundleOptions;

export async function buildTargets(watch = false): Promise<void> {
  if (!watch) await writeThirdPartyNotices();
  const mainOptions: BuildOptions = {
    ...common,
    entryPoints: ['electron/src/main/index.ts'],
    outfile: 'electron/dist/main.cjs',
  };
  const preloadOptions: BuildOptions = {
    ...common,
    entryPoints: ['electron/src/preload/index.ts'],
    outfile: 'electron/dist/preload.cjs',
  };
  const quickCapturePreloadOptions: BuildOptions = {
    ...common,
    entryPoints: ['electron/src/preload/quick-capture.ts'],
    outfile: 'electron/dist/quick-capture-preload.cjs',
  };

  const targets = [mainOptions, preloadOptions, quickCapturePreloadOptions];
  if (watch) {
    const contexts: BuildContext[] = [];
    const initialBuilds: Promise<void>[] = [];
    try {
      for (const options of targets) {
        let resolve!: () => void;
        let reject!: (error: Error) => void;
        initialBuilds.push(new Promise<void>((done, fail) => { resolve = done; reject = fail; }));
        contexts.push(await context({
          ...options,
          plugins: [...common.plugins!, {
            name: 'initial-build-ready',
            setup(api) {
              api.onEnd(result => {
                if (result.errors.length) reject(new Error(`Initial Electron build failed: ${options.outfile}`));
                else resolve();
              });
            },
          }],
        }));
      }
      // watch() starts its own initial build and returns before it completes.
      await Promise.all([Promise.all(initialBuilds), Promise.all(contexts.map(entry => entry.watch()))]);
    } catch (error) {
      await Promise.all(contexts.map(entry => entry.dispose()));
      throw error;
    }
    return;
  }

  await Promise.all(targets.map(options => build(options)));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  buildTargets(isWatch).then(() => {
    if (isWatch) process.send?.('electron-build-ready');
  }).catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
