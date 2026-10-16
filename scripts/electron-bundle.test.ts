import { build } from 'esbuild';
import { describe, expect, it } from 'vitest';
import { electronBundleOptions } from './electron-bundle';

describe('Electron external dependencies', () => {
  it('allows Electron and Node builtins', async () => {
    await expect(build({ ...electronBundleOptions, write: false, stdin: { contents: "require('electron'); require('fs'); require('node:fs/promises')" } })).resolves.toBeDefined();
  });
  it('fails the build for any other external package', async () => {
    await expect(build({ ...electronBundleOptions, write: false, external: ['unexpected-package'], stdin: { contents: "require('unexpected-package')" } })).rejects.toThrow('Unbundled Electron dependency: unexpected-package');
  });
});
