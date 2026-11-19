import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parseAst, transformWithEsbuild } from 'vite';
import { beforeAll, describe, expect, it } from 'vitest';

const ROOT = path.resolve(import.meta.dirname, '../..');
const EXTENSIONS = ['.ts', '.tsx', '/index.ts', '/index.tsx'];

function resolveImport(from: string, specifier: string) {
  let base: string;
  if (specifier.startsWith('@/')) base = path.join(ROOT, 'src', specifier.slice(2));
  else if (specifier.startsWith('.')) base = path.resolve(path.dirname(from), specifier);
  else return null; // A package: not ours to police here.
  if (/\.(css|svg|png|json)(\?.*)?$/.test(specifier)) return null;
  for (const candidate of [base, ...EXTENSIONS.map((extension) => base + extension)]) {
    if (/\.tsx?$/.test(candidate) && existsSync(candidate)) return candidate;
  }
  throw new Error(`Cannot resolve ${specifier} from ${path.relative(ROOT, from)}`);
}

/**
 * Static imports and re-exports of a module, as the bundle sees them: esbuild drops `import type`
 * and imports only types use, and `import()` is not an import declaration.
 */
async function staticImports(file: string) {
  const { code } = await transformWithEsbuild(readFileSync(file, 'utf8'), file, { jsx: 'automatic' });
  const specifiers: string[] = [];
  for (const node of parseAst(code).body) {
    if ((node.type === 'ImportDeclaration' || node.type === 'ExportAllDeclaration' || node.type === 'ExportNamedDeclaration')
      && node.source && typeof node.source.value === 'string') {
      specifiers.push(node.source.value);
    }
  }
  return specifiers;
}

/** Every source module the renderer evaluates before its first dynamic import resolves. */
async function eagerModules(entry: string) {
  const seen = new Set<string>();
  const stack = [path.join(ROOT, entry)];
  while (stack.length > 0) {
    const file = stack.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    for (const specifier of await staticImports(file)) {
      const resolved = resolveImport(file, specifier);
      if (resolved) stack.push(resolved);
    }
  }
  return [...seen].map((file) => path.relative(ROOT, file)).sort();
}

describe('renderer route boundaries', () => {
  // Both windows load src/main.tsx; the Quick Hack window renders #/quick-capture from it.
  let eager: string[] = [];

  beforeAll(async () => {
    eager = await eagerModules('src/main.tsx');
  });

  it('renders Quick Hack from the entry chunk', () => {
    expect(eager).toContain('src/pages/QuickCapture.tsx');
  });

  it('keeps the workbench out of what the Quick Hack window evaluates', () => {
    const workbench = eager.filter((file) => (
      file === 'src/pages/Home.tsx'
      || file.startsWith('src/pages/electron-home/')
      || file.startsWith('src/components/hackmd-live-preview/')
      || file === 'src/components/MarkdownEditor.tsx'
      || file === 'src/pages/Presentation.tsx'
    ));
    expect(workbench).toEqual([]);
  });
});
