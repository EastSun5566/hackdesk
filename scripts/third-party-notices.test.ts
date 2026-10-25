import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { collectNotices, readProductionDependencies } from './third-party-notices';

vi.mock('node:child_process', () => ({ execFileSync: vi.fn() }));

const temporary: string[] = [];
afterEach(async () => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  await Promise.all(temporary.splice(0).map(path => rm(path, { recursive: true, force: true })));
});
async function fixture(name: string, license: string) {
  const path = await mkdtemp(join(tmpdir(), 'hackdesk-notices-'));
  temporary.push(path);
  await writeFile(join(path, 'package.json'), JSON.stringify({ name, version: '1.0.0', license }));
  return { path };
}

it.each([
  ['/tools/pnpm.cjs', true],
  ['/tools/corepack/pnpm.js', true],
  ['/tools/pnpm', false],
  ['C:\\tools\\pnpm.exe', false],
])('reads the dependency tree through launcher %s', (launcher, isJavaScript) => {
  const tree = [{ dependencies: { example: { path: '/packages/example' } } }];
  vi.stubEnv('npm_execpath', launcher);
  vi.mocked(execFileSync).mockReturnValue(JSON.stringify(tree));

  expect(readProductionDependencies()).toEqual(tree);
  const args = ['list', '--prod', '--depth', 'Infinity', '--json'];
  expect(execFileSync).toHaveBeenCalledWith(
    isJavaScript ? process.execPath : launcher,
    isJavaScript ? [launcher, ...args] : args,
    expect.objectContaining({ encoding: 'utf8', shell: false }),
  );
});

it('collects the resolved transitive closure once, in stable order, preserving original notices', async () => {
  const a = await fixture('a', 'MIT');
  const b = await fixture('b', 'SEE LICENSE IN legal/terms.txt');
  await writeFile(join(a.path, 'LICENSE'), 'Original A license\n');
  await writeFile(join(a.path, 'NOTICE'), 'Original A notice\n');
  await mkdir(join(b.path, 'legal'));
  await writeFile(join(b.path, 'legal/terms.txt'), 'Original B terms\n');
  const tree = [{ dependencies: { b: { ...b, dependencies: { a } }, a } }];
  const result = await collectNotices(tree);
  expect(result.map(pkg => pkg.name)).toEqual(['a', 'b']);
  expect(result[0].files.LICENSE.toString()).toBe('Original A license\n');
  expect(result[0].files.NOTICE.toString()).toBe('Original A notice\n');
  expect(result[1].files['legal/terms.txt'].toString()).toBe('Original B terms\n');
  expect(result).toEqual(await collectNotices(tree));
  expect(JSON.stringify(result)).not.toContain(a.path);
});

it('fails when a package explicitly declares a missing license file', async () => {
  const dependency = await fixture('missing', 'SEE LICENSE IN absent.txt');
  await expect(collectNotices([{ dependencies: { dependency } }])).rejects.toThrow('ENOENT');
});

it('rejects a declared license outside its package', async () => {
  const dependency = await fixture('escape', 'SEE LICENSE IN ../outside.txt');
  await expect(collectNotices([{ dependencies: { dependency } }])).rejects.toThrow('License file escapes package');
});

it('rejects a license reached through a directory symlink outside the package', async () => {
  const dependency = await fixture('linked', 'SEE LICENSE IN legal/LICENSE');
  const outside = await fixture('outside', 'MIT');
  await writeFile(join(outside.path, 'LICENSE'), 'Outside package');
  await symlink(outside.path, join(dependency.path, 'legal'), process.platform === 'win32' ? 'junction' : 'dir');
  await expect(collectNotices([{ dependencies: { dependency } }])).rejects.toThrow('License file escapes package');
});
