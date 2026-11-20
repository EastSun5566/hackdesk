/**
 * What each renderer route loads before it can render: builds the renderer with Vite into a
 * throwaway directory and walks the chunk graph.
 *
 *   node scripts/route-chunks.ts            # table of eager bytes per route
 *   node scripts/route-chunks.ts --json     # the same, as JSON
 *   node scripts/route-chunks.ts --modules  # also list the source modules each route evaluates
 *
 * "Eager" is the entry chunk, every chunk it imports statically, and, for a lazy route, the route's
 * own chunk and its static imports. Chunks a route reaches only through a later dynamic import
 * (the Quick Hack editor, the presentation's reveal.js) are counted separately as "deferred".
 */
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { build, type Rollup } from 'vite';

type ChunkInfo = {
  fileName: string;
  bytes: number;
  imports: string[];
  dynamicImports: string[];
  modules: string[];
  facadeModuleId: string | null;
  isEntry: boolean;
};

const ROOT = path.resolve(import.meta.dirname, '..');

/** The page module of each route, as `src/routes.tsx` maps them. */
const ROUTE_PAGES = {
  main: 'src/pages/Home.tsx',
  'quick-capture': 'src/pages/QuickCapture.tsx',
  present: 'src/pages/Presentation.tsx',
} as const;

type RouteName = keyof typeof ROUTE_PAGES;

type RouteLoad = {
  route: RouteName;
  eagerChunks: string[];
  eagerBytes: number;
  eagerModules: string[];
  deferredBytes: number;
};

function relative(id: string) {
  return path.relative(ROOT, id.replace(/^\0/, '').replace(/\?.*$/, ''));
}

async function collectChunks(): Promise<Map<string, ChunkInfo>> {
  const outDir = mkdtempSync(path.join(os.tmpdir(), 'hackdesk-route-chunks-'));
  const chunks = new Map<string, ChunkInfo>();
  try {
    await build({
      root: ROOT,
      configFile: path.join(ROOT, 'vite.config.ts'),
      logLevel: 'error',
      build: { outDir, emptyOutDir: true, reportCompressedSize: false },
      plugins: [{
        name: 'hackdesk-route-chunks',
        generateBundle(_options, bundle: Rollup.OutputBundle) {
          for (const output of Object.values(bundle)) {
            if (output.type !== 'chunk') continue;
            chunks.set(output.fileName, {
              fileName: output.fileName,
              bytes: Buffer.byteLength(output.code),
              imports: output.imports,
              dynamicImports: output.dynamicImports,
              modules: Object.keys(output.modules).map(relative),
              facadeModuleId: output.facadeModuleId ? relative(output.facadeModuleId) : null,
              isEntry: output.isEntry,
            });
          }
        },
      }],
    });
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
  return chunks;
}

function staticClosure(chunks: Map<string, ChunkInfo>, roots: string[]) {
  const seen = new Set<string>();
  const stack = [...roots];
  while (stack.length > 0) {
    const name = stack.pop()!;
    if (seen.has(name)) continue;
    seen.add(name);
    stack.push(...(chunks.get(name)?.imports ?? []));
  }
  return seen;
}

function fullClosure(chunks: Map<string, ChunkInfo>, roots: string[]) {
  const seen = new Set<string>();
  const stack = [...roots];
  while (stack.length > 0) {
    const name = stack.pop()!;
    if (seen.has(name)) continue;
    seen.add(name);
    const chunk = chunks.get(name);
    stack.push(...(chunk?.imports ?? []), ...(chunk?.dynamicImports ?? []));
  }
  return seen;
}

/** The chunk whose code holds a module, whether as its facade or bundled into it. */
function chunkOf(chunks: Map<string, ChunkInfo>, moduleId: string) {
  for (const chunk of chunks.values()) {
    if (chunk.facadeModuleId === moduleId) return chunk.fileName;
  }
  for (const chunk of chunks.values()) {
    if (chunk.modules.includes(moduleId)) return chunk.fileName;
  }
  throw new Error(`No chunk contains ${moduleId}`);
}

function routeLoads(chunks: Map<string, ChunkInfo>): RouteLoad[] {
  const entry = [...chunks.values()].find((chunk) => chunk.isEntry);
  if (!entry) throw new Error('The build has no entry chunk');

  return (Object.keys(ROUTE_PAGES) as RouteName[]).map((route) => {
    const page = chunkOf(chunks, ROUTE_PAGES[route]);
    const eager = staticClosure(chunks, [entry.fileName, page]);
    const everything = fullClosure(chunks, [page]);
    const sum = (names: Iterable<string>) => [...names].reduce((total, name) => total + (chunks.get(name)?.bytes ?? 0), 0);
    const deferred = [...everything].filter((name) => !eager.has(name));
    return {
      route,
      eagerChunks: [...eager].sort(),
      eagerBytes: sum(eager),
      eagerModules: [...eager].flatMap((name) => chunks.get(name)?.modules ?? []).sort(),
      deferredBytes: sum(deferred),
    };
  });
}

function kb(bytes: number) {
  return `${(bytes / 1024).toFixed(1)} KiB`;
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const loads = routeLoads(await collectChunks());
  if (args.has('--json')) {
    console.log(JSON.stringify(loads.map(({ eagerModules, ...load }) => (
      args.has('--modules') ? { ...load, eagerModules } : load
    )), null, 2));
    return;
  }
  for (const load of loads) {
    const sourceModules = load.eagerModules.filter((id) => id.startsWith('src/'));
    console.log(`${load.route}: ${kb(load.eagerBytes)} eager in ${load.eagerChunks.length} chunks, `
      + `${load.eagerModules.length} modules (${sourceModules.length} from src/); `
      + `${kb(load.deferredBytes)} reachable later through dynamic imports`);
    if (args.has('--modules')) {
      for (const id of sourceModules) console.log(`  ${id}`);
    }
  }
}

if (import.meta.main) await main();
