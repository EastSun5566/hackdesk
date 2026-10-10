// node scripts/benchmark-command-palette.ts [--ref=<commit>] [--output=<file>]
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { cpus, release, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { _electron } from '@playwright/test';
import { build } from 'esbuild';

const repoRoot = resolve(import.meta.dirname, '..');
const argument = (name: string) => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const keys = ['closed', 'open', 'query'] as const;
type Measurement = { count: number; rows: Record<typeof keys[number], number[]>[] };

function summarize(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  return { median: sorted[Math.floor(sorted.length / 2)], p95: sorted[Math.ceil(sorted.length * 0.95) - 1] };
}

async function main() {
  const work = await mkdtemp(join(tmpdir(), 'hackdesk-palette-benchmark-'));
  const ref = argument('ref');
  try {
    let sourceRoot = repoRoot;
    if (ref) {
      sourceRoot = join(work, 'source');
      await mkdir(sourceRoot);
      const archive = execFileSync('git', ['archive', ref, 'src'], { cwd: repoRoot, maxBuffer: 64 * 1024 * 1024 });
      execFileSync('tar', ['-x', '-C', sourceRoot], { input: archive });
    }
    await build({
      entryPoints: [join(repoRoot, 'benchmarks/command-palette/palette.tsx')],
      outfile: join(work, 'palette.js'), bundle: true, format: 'esm', platform: 'browser', jsx: 'automatic',
      nodePaths: [join(repoRoot, 'node_modules')], logLevel: 'silent',
      // flushSync, portals and createRoot must use the same profiling renderer.
      alias: { '@': join(sourceRoot, 'src'), 'react-dom/client': 'react-dom/profiling', 'react-dom': 'react-dom/profiling' },
      define: { 'process.env.NODE_ENV': '"production"' },
    });
    await writeFile(join(work, 'index.html'), '<!doctype html><div id="root"></div><script type="module" src="palette.js"></script>');
    // No production settings, IPC, clipboard or user vault access.
    await writeFile(join(work, 'main.cjs'), `const{app,BrowserWindow}=require('electron');const path=require('node:path');app.setPath('userData',path.join(__dirname,'data'));app.setPath('home',__dirname);app.whenReady().then(()=>new BrowserWindow({width:1080,height:760,webPreferences:{sandbox:true,contextIsolation:true}}).loadFile(path.join(__dirname,'index.html')));app.on('window-all-closed',()=>app.quit());`);
    const app = await _electron.launch({
      executablePath: join(repoRoot, 'node_modules/electron', process.platform === 'darwin' ? 'dist/Electron.app/Contents/MacOS/Electron' : process.platform === 'win32' ? 'dist/electron.exe' : 'dist/electron'),
      args: [join(work, 'main.cjs')],
    });
    try {
      const page = await app.firstWindow();
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.waitForFunction('Boolean(window.paletteBenchmark)');
      const results = [];
      for (const count of [1000, 10000]) {
        const measurement = await page.evaluate(`window.paletteBenchmark.measure(${count})`) as Measurement;
        // Fail clearly if React profiling was accidentally disabled.
        assert(measurement.rows.some(row => row.query.some(duration => duration > 0)), 'Missing React Profiler samples');
        const summary = Object.fromEntries(keys.map(key => [key, summarize(measurement.rows.flatMap(row => row[key]))]));
        results.push({ ...measurement, summary });
        console.error(`${count} notes: ${JSON.stringify(summary)}`);
      }
      assert.equal(errors.length, 0, errors.join('\n'));
      const sourceHash = createHash('sha256');
      for (const file of ['src/pages/electron-home/CommandPaletteDialog.tsx', 'src/lib/electron-quick-open.ts', 'src/lib/fuzzy-search.ts']) {
        sourceHash.update(await readFile(join(sourceRoot, file)));
      }
      const output = {
        ref: ref ?? 'working-tree', head: execFileSync('git', ['rev-parse', ref ?? 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim(),
        sourceSha256: sourceHash.digest('hex'), versions: await app.evaluate(() => process.versions),
        os: release(), cpu: cpus()[0]?.model, window: { width: 1080, height: 760 }, measuredRuns: 5, results,
      };
      const json = `${JSON.stringify(output, null, 2)}\n`;
      if (argument('output')) await writeFile(resolve(argument('output')!), json);
      else console.log(json);
    } finally {
      await app.close();
    }
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

await main();
