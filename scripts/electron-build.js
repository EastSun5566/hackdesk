import { build, context } from 'esbuild';

const isWatch = process.argv.includes('--watch');
const common = {
  bundle: true,
  platform: 'node',
  format: 'cjs',
  external: ['electron'],
  sourcemap: !process.env.CI,
  logLevel: 'info',
};

async function buildTargets() {
  const mainOptions = {
    ...common,
    entryPoints: ['electron/src/main/index.ts'],
    outfile: 'electron/dist/main.cjs',
  };
  const preloadOptions = {
    ...common,
    entryPoints: ['electron/src/preload/index.ts'],
    outfile: 'electron/dist/preload.cjs',
  };

  if (isWatch) {
    await Promise.all([
      build(mainOptions),
      build(preloadOptions),
    ]);

    const [mainContext, preloadContext] = await Promise.all([
      context(mainOptions),
      context(preloadOptions),
    ]);

    await Promise.all([mainContext.watch(), preloadContext.watch()]);
    return;
  }

  await Promise.all([
    build(mainOptions),
    build(preloadOptions),
  ]);
}

buildTargets().catch((error) => {
  console.error(error);
  process.exit(1);
});
