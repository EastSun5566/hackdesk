import { build, context, type BuildOptions } from 'esbuild';

const isWatch = process.argv.includes('--watch');
const common: BuildOptions = {
  bundle: true,
  platform: 'node',
  format: 'cjs',
  external: ['electron'],
  sourcemap: !process.env.CI,
  logLevel: 'info',
};

async function buildTargets(): Promise<void> {
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

  if (isWatch) {
    await Promise.all([
      build(mainOptions),
      build(preloadOptions),
      build(quickCapturePreloadOptions),
    ]);

    const [mainContext, preloadContext, quickCapturePreloadContext] = await Promise.all([
      context(mainOptions),
      context(preloadOptions),
      context(quickCapturePreloadOptions),
    ]);

    await Promise.all([mainContext.watch(), preloadContext.watch(), quickCapturePreloadContext.watch()]);
    return;
  }

  await Promise.all([
    build(mainOptions),
    build(preloadOptions),
    build(quickCapturePreloadOptions),
  ]);
}

buildTargets().catch((error) => {
  console.error(error);
  process.exit(1);
});
