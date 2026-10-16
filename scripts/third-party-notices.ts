import { execFileSync } from 'node:child_process';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';

interface Dependency {
  path?: string;
  dependencies?: Record<string, Dependency>;
  optionalDependencies?: Record<string, Dependency>;
}

export async function collectNotices(roots: Dependency[]) {
  const visited = new Set<string>();
  const packages = new Map<string, { name: string; version: string; license: unknown; files: Record<string, Buffer> }>();
  async function visit(dependency: Dependency, includePackage: boolean) {
    if (dependency.path && includePackage && !visited.has(dependency.path)) {
      visited.add(dependency.path);
      const pkg = JSON.parse(await readFile(join(dependency.path, 'package.json'), 'utf8'));
      const key = `${pkg.name}@${pkg.version}`;
      if (!packages.has(key)) {
        const names = new Set((await readdir(dependency.path, { withFileTypes: true })).filter(entry => !entry.isDirectory() && /^(licen[cs]e|copying|notice|copyright|ofl)([._-].*)?$/i.test(entry.name)).map(entry => entry.name));
        const license = pkg.license ?? pkg.licenses ?? null;
        const declared = typeof license === 'string' ? /^SEE LICENSE IN (.+)$/i.exec(license)?.[1] : undefined;
        if (declared) {
          const path = resolve(dependency.path, declared);
          const rel = relative(dependency.path, path);
          if (isAbsolute(rel) || rel === '..' || rel.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`)) {
            throw new Error(`License file escapes package: ${key}`);
          }
          names.add(declared);
        }
        const files: Record<string, Buffer> = {};
        for (const name of [...names].sort()) {
          // A declared license must exist; do not silently ship incomplete notices.
          files[name.replaceAll('\\', '/')] = await readFile(join(dependency.path, name));
        }
        packages.set(key, { name: pkg.name, version: pkg.version, license, files });
      }
    }
    for (const child of Object.values({ ...dependency.dependencies, ...dependency.optionalDependencies })) {
      if (!child.path || !visited.has(child.path)) await visit(child, true);
    }
  }
  for (const root of roots) await visit(root, false);
  return [...packages.entries()].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([, pkg]) => pkg);
}

export async function writeThirdPartyNotices() {
  // npm_execpath is supplied by pnpm on all three build platforms. The fallback
  // also supports invoking electron-build.ts directly from a developer shell.
  const args = ['list', '--prod', '--depth', 'Infinity', '--json'];
  const output = process.env.npm_execpath
    ? execFileSync(process.execPath, [process.env.npm_execpath, ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    : execFileSync('pnpm', args, { encoding: 'utf8', shell: process.platform === 'win32', maxBuffer: 64 * 1024 * 1024 });
  const packages = await collectNotices(JSON.parse(output));
  const directory = 'electron/dist/third-party';
  await rm(directory, { recursive: true, force: true });
  await mkdir(directory, { recursive: true });
  const index = [];
  for (const { files, ...pkg } of packages) {
    const folder = encodeURIComponent(`${pkg.name}@${pkg.version}`);
    for (const [name, contents] of Object.entries(files)) {
      const destination = join(directory, folder, name);
      await mkdir(join(destination, '..'), { recursive: true });
      await writeFile(destination, contents);
    }
    index.push({ ...pkg, files: Object.keys(files).map(name => `${folder}/${name}`) });
  }
  await writeFile(join(directory, 'packages.json'), `${JSON.stringify(index, null, 2)}\n`);
}
