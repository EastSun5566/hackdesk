import { isBuiltin } from 'node:module';
import type { BuildOptions, Metafile, Plugin } from 'esbuild';

export function assertBundledDependencies(metafile: Metafile) {
  for (const output of Object.values(metafile.outputs)) {
    for (const entry of output.imports) {
      if (entry.external && entry.path !== 'electron' && !isBuiltin(entry.path)) {
        throw new Error(`Unbundled Electron dependency: ${entry.path}`);
      }
    }
  }
}

const dependencyGuard: Plugin = {
  name: 'bundled-dependencies',
  setup(api) {
    api.onEnd(result => {
      if (result.errors.length) return;
      try { assertBundledDependencies(result.metafile!); }
      catch (error) { return { errors: [{ text: (error as Error).message }] }; }
    });
  },
};

export const electronBundleOptions: BuildOptions = {
  bundle: true,
  platform: 'node',
  format: 'cjs',
  external: ['electron'],
  sourcemap: !process.env.CI,
  logLevel: 'info',
  metafile: true,
  plugins: [dependencyGuard],
};
