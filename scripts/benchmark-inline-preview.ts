// node scripts/benchmark-inline-preview.ts [--ref=<commit>] [--output=<file>] [--profile] [--artifacts=<directory>]
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { cpus, release, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { build } from 'esbuild';
import { _electron } from '@playwright/test';

const repoRoot = resolve(import.meta.dirname, '..');
const argument = (name: string) => process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3);
type Measurement = {
  lines: number; openedMs: number; mountLongTasks: number[]; longTasks: number[];
  samples: Record<'typing' | 'cursor' | 'scroll', number[]>;
  dispatchMs: Record<'typing' | 'cursor', number[]>;
};
type CpuProfile = {
  nodes: { id: number; children?: number[]; callFrame: { functionName: string } }[];
  samples?: number[]; timeDeltas?: number[];
};

function profileAttribution(profile: CpuProfile) {
  const nodes = new Map(profile.nodes.map((node) => [node.id, node]));
  const parents = new Map<number, number>();
  for (const node of profile.nodes) for (const child of node.children ?? []) parents.set(child, node.id);
  const totals = new Map<string, number>();
  const targets = /^(buildDecorations|buildPreviewDocument|buildRichPreviewDecorations|createHfmDocumentIndex|addHackmdLineSyntaxRanges|addInlineWidgets|addDollarMathBlocks|getOrderedListMarkerPreviews|buildTableWidgets|ensureSyntaxTree)$/;
  for (let index = 0; index < (profile.samples?.length ?? 0); index++) {
    let id: number | undefined = profile.samples![index];
    const names = new Set<string>();
    while (id !== undefined) {
      const name = nodes.get(id)!.callFrame.functionName;
      if (targets.test(name)) names.add(name);
      id = parents.get(id);
    }
    for (const name of names) totals.set(name, (totals.get(name) ?? 0) + (profile.timeDeltas?.[index] ?? 0) / 1000);
  }
  return Object.fromEntries([...totals].sort((a, b) => b[1] - a[1])); // Inclusive sampling time; nested totals overlap.
}

function summarize(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  return { median: sorted[Math.floor(sorted.length / 2)], p95: sorted[Math.ceil(sorted.length * 0.95) - 1] };
}

async function main() {
  const work = await mkdtemp(join(tmpdir(), 'hackdesk-preview-benchmark-'));
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
      entryPoints: [join(repoRoot, 'benchmarks/inline-preview/editor.tsx')],
      outdir: join(work, 'renderer'), bundle: true, splitting: true, format: 'esm', platform: 'browser', jsx: 'automatic',
      alias: { '@': join(sourceRoot, 'src') }, nodePaths: [join(repoRoot, 'node_modules')],
      define: { 'process.env.NODE_ENV': '"production"' }, loader: { '.woff2': 'file', '.woff': 'file', '.ttf': 'file' },
    });
    await writeFile(join(work, 'renderer/index.html'), '<!doctype html><style>body{margin:0;background:#202126;color:#ddd}#editor{width:1080px;height:650px;margin:20px}.hackmd-markdown-editor{height:650px}.cm-editor{height:100%;font-size:14px}.cm-content,.cm-line{font-family:monospace!important;font-size:14px!important}.cm-scroller{overflow:auto}</style><div id="editor"></div><script type="module" src="./editor.js"></script>');
    // No production settings, IPC, clipboard or user vault access.
    await writeFile(join(work, 'main.cjs'), `const {app,BrowserWindow}=require('electron');const path=require('node:path');app.setPath('userData',path.join(__dirname,'user-data'));app.setPath('home',__dirname);app.whenReady().then(()=>new BrowserWindow({width:1120,height:760,webPreferences:{sandbox:true,contextIsolation:true}}).loadFile(path.join(__dirname,'renderer/index.html')));app.on('window-all-closed',()=>app.quit());`);
    const artifacts = argument('artifacts') ? resolve(argument('artifacts')!) : undefined;
    if (artifacts) await mkdir(artifacts, { recursive: true });
    const app = await _electron.launch({
      executablePath: join(repoRoot, 'node_modules/electron', process.platform === 'darwin' ? 'dist/Electron.app/Contents/MacOS/Electron' : process.platform === 'win32' ? 'dist/electron.exe' : 'dist/electron'),
      args: [join(work, 'main.cjs')],
      recordVideo: artifacts ? { dir: artifacts, size: { width: 1120, height: 760 } } : undefined,
    });
    try {
      const page = await app.firstWindow();
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.route('https://**', (route) => route.fulfill({ contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg==', 'base64') }));
      await page.waitForFunction('Boolean(window.previewBenchmark)');
      const features = await page.evaluate('window.previewBenchmark.checkFeatures()') as Record<string, unknown>[];
      assert(features.every((row) => Object.values(row).every((value) => value !== false)), JSON.stringify(features));
      let profile: CpuProfile | undefined;
      if (process.argv.includes('--profile')) {
        const session = await page.context().newCDPSession(page);
        await page.evaluate('window.previewBenchmark.measure(10000)'); // Warm before CPU sampling.
        await session.send('Profiler.enable');
        await session.send('Profiler.start');
        await page.evaluate('window.previewBenchmark.measure(10000)');
        profile = (await session.send('Profiler.stop')).profile;
        if (artifacts) await writeFile(join(artifacts, 'editor.cpuprofile'), JSON.stringify(profile));
        await session.detach();
      }
      const results = [];
      for (const lines of [100, 1000, 10000]) {
        await page.evaluate(`window.previewBenchmark.measure(${lines})`);
        const rows: Measurement[] = [];
        for (let run = 0; run < 5; run++) {
          rows.push(await page.evaluate(`window.previewBenchmark.measure(${lines})`) as Measurement);
        }
        const summary = {
          open: summarize(rows.map((row) => row.openedMs)),
          ...Object.fromEntries(['typing', 'cursor', 'scroll'].map((key) => [key, summarize(rows.flatMap((row) => row.samples[key as keyof Measurement['samples']]))])),
          dispatch: Object.fromEntries(['typing', 'cursor'].map((key) => [key, summarize(rows.flatMap((row) => row.dispatchMs[key as keyof Measurement['dispatchMs']]))])),
          longTaskCounts: rows.map((row) => row.longTasks.length),
        };
        results.push({ lines, rows, summary });
        console.error(`${lines} lines: ${JSON.stringify(summary)}`);
      }
      if (artifacts) await page.screenshot({ path: join(artifacts, 'large-document.png') });
      assert.equal(errors.length, 0, errors.join('\n'));
      const sourceHash = createHash('sha256');
      for (const file of ['inline-preview.ts', 'rich-preview-widgets.ts', 'hfm-decoration-ranges.ts', 'hfm-document-index.ts']) {
        sourceHash.update(await readFile(join(sourceRoot, 'src/components/hackmd-live-preview', file)));
      }
      const output = { ref: ref ?? 'working-tree', head: execFileSync('git', ['rev-parse', ref ?? 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim(),
        sourceSha256: sourceHash.digest('hex'),
        versions: await app.evaluate(() => process.versions), os: release(), cpu: cpus()[0]?.model,
        viewport: { width: 1080, height: 650 }, font: '14px monospace', measuredRuns: 5, features, results,
        profileInclusiveMs: profile ? profileAttribution(profile) : undefined };
      const json = `${JSON.stringify(output, null, 2)}\n`;
      if (argument('output')) await writeFile(resolve(argument('output')!), json);
      else console.log(json);
    } finally { await app.close(); }
  } finally { await rm(work, { recursive: true, force: true }); }
}

main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
