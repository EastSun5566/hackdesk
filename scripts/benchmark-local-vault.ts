// node scripts/benchmark-local-vault.ts [--ref=<commit>] [--output=<file>] [--bytes=1024]
// Isolated Node benchmark of the production scanner; never reads the user's vault.
import assert from 'node:assert/strict';
import { execFile, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { cpus, release, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { monitorEventLoopDelay, performance } from 'node:perf_hooks';
import { promisify } from 'node:util';
import { build } from 'esbuild';

const repoRoot = resolve(import.meta.dirname, '..');
const argument = (name: string) => process.argv.find((value) => value.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
const require = createRequire(import.meta.url);
const measuredRuns = 5;
// The CJS bundle crosses a process boundary; describe only fields used by this harness.
type Snapshot = { notes: { id: string; relativePath: string; revision: { contentHash: string; mtimeMs: number } }[] };
type BenchmarkService = {
  scanLocalVault: (path: string) => Promise<Snapshot>;
  writeLocalNote: (input: { noteId: string; content: string; expectedRevision: Snapshot['notes'][number]['revision'] }) => Promise<{
    document: { id: string; content: string }; snapshot: Snapshot;
  }>;
};

async function measureVault(bundle: string, count: number, bytes: number) {
  const home = await mkdtemp(join(tmpdir(), 'hackdesk-scan-fixture-'));
  process.env.HACKDESK_BENCH_HOME = home;
  const vault = join(home, 'vault');
  try {
    await mkdir(join(home, '.hackdesk'));
    await mkdir(join(vault, 'Folder'), { recursive: true });
    await writeFile(join(home, '.hackdesk', 'settings.json'), JSON.stringify({ localVault: { path: vault } }));
    for (let start = 0; start < count; start += 32) {
      await Promise.all(Array.from({ length: Math.min(32, count - start) }, (_, offset) => {
        const i = start + offset;
        return writeFile(join(vault, 'Folder', `Note-${i}.md`), `# Note ${i}\n${'x'.repeat(bytes)}`);
      }));
    }
    const service = require(bundle) as BenchmarkService;
    let snapshot = await service.scanLocalVault(vault); // Warm scanner, manifest and filesystem cache.
    const noteId = snapshot.notes.find((note) => note.relativePath === 'Folder/Note-0.md')!.id;
    await service.writeLocalNote({ noteId, content: '# Warm save', expectedRevision: snapshot.notes.find((note) => note.id === noteId)!.revision });
    const rows = [];
    for (let run = 0; run < measuredRuns; run++) {
      let peakRss = process.memoryUsage().rss;
      const rssBefore = peakRss;
      const sampler = setInterval(() => { peakRss = Math.max(peakRss, process.memoryUsage().rss); }, 5);
      const lag = monitorEventLoopDelay({ resolution: 10 });
      lag.enable();
      try {
        const scanStart = performance.now();
        snapshot = await service.scanLocalVault(vault);
        const scanMs = performance.now() - scanStart;
        assert.equal(snapshot.notes.length, count);
        const note = snapshot.notes.find((item) => item.id === noteId)!;
        const saveStart = performance.now();
        const saved = await service.writeLocalNote({ noteId, content: `# Saved ${run}`, expectedRevision: note.revision });
        const saveSnapshotMs = performance.now() - saveStart;
        assert.equal(saved.snapshot.notes.length, count);
        assert.equal(saved.document.id, noteId);
        assert.equal(saved.document.content, `# Saved ${run}`);
        peakRss = Math.max(peakRss, process.memoryUsage().rss);
        rows.push({ run, scanMs, saveSnapshotMs, rssBeforeMiB: rssBefore / 2 ** 20, peakRssMiB: peakRss / 2 ** 20, eventLoopMaxMs: lag.max / 1e6 });
      } finally {
        clearInterval(sampler);
        lag.disable();
      }
    }
    return { count, bytes, rows, processPeakRssMiB: process.resourceUsage().maxRSS / 1024 };
  } finally {
    await rm(home, { recursive: true, force: true });
  }
}

function summarize(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  return { median: sorted[Math.floor(sorted.length / 2)], p95: sorted[Math.ceil(sorted.length * 0.95) - 1] };
}

async function main() {
  if (process.argv[2] === '--child') {
    console.log(JSON.stringify(await measureVault(process.argv[3], Number(process.argv[4]), Number(process.argv[5]))));
    return;
  }
  const ref = argument('ref');
  const bytes = Number(argument('bytes') ?? 1024);
  assert(Number.isSafeInteger(bytes) && bytes > 0 && bytes < 10 * 1024 * 1024, 'bytes must be between 1 and 10 MiB');
  const work = await mkdtemp(join(tmpdir(), 'hackdesk-scan-benchmark-'));
  try {
    let sourceRoot = repoRoot;
    if (ref) {
      sourceRoot = join(work, 'source');
      await mkdir(sourceRoot);
      const archive = execFileSync('git', ['archive', ref, 'electron/src', 'src'], { cwd: repoRoot, maxBuffer: 64 * 1024 * 1024 });
      execFileSync('tar', ['-x', '-C', sourceRoot], { input: archive });
    }
    const bundle = join(work, 'vault.cjs');
    const serviceSource = await readFile(join(sourceRoot, 'electron/src/main/local-vault-service.ts'), 'utf8');
    await build({
      entryPoints: [join(sourceRoot, 'electron/src/main/local-vault-service.ts')],
      outfile: bundle, bundle: true, platform: 'node', format: 'cjs',
      nodePaths: [join(repoRoot, 'node_modules')],
      alias: { '@': join(sourceRoot, 'src') },
      plugins: [{
        name: 'isolated-electron',
        setup(builder) {
          builder.onResolve({ filter: /^electron$/ }, () => ({ path: 'electron', namespace: 'fixture' }));
          builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({
            contents: 'export const app={getPath:()=>process.env.HACKDESK_BENCH_HOME}; export const safeStorage={isEncryptionAvailable:()=>false}; export const shell={}; export const crashReporter={};',
            loader: 'js',
          }));
        },
      }],
    });
    const results = [];
    for (const count of [100, 1000, 10000]) {
      // Fresh process per size: no retained snapshots or module state from smaller vaults.
      const { stdout } = await promisify(execFile)(process.execPath, [process.argv[1], '--child', bundle, String(count), String(bytes)], { cwd: repoRoot });
      const data = JSON.parse(stdout) as Awaited<ReturnType<typeof measureVault>>;
      const summary = Object.fromEntries(['scanMs', 'saveSnapshotMs', 'peakRssMiB', 'eventLoopMaxMs'].map((key) => (
        [key, summarize(data.rows.map((row) => row[key as keyof typeof row]))]
      )));
      results.push({ ...data, summary });
      console.error(`${count} notes: ${JSON.stringify(summary)}`);
    }
    const output = {
      ref: ref ?? 'working-tree', sourceSha256: createHash('sha256').update(serviceSource).digest('hex'),
      scanConcurrency: Number(serviceSource.match(/const SCAN_CONCURRENCY = (\d+);/)?.[1]) || null,
      node: process.version, platform: process.platform, arch: process.arch, os: release(), cpu: cpus()[0]?.model, measuredRuns, results,
    };
    const json = `${JSON.stringify(output, null, 2)}\n`;
    if (argument('output')) await writeFile(resolve(argument('output')!), json);
    else console.log(json);
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
