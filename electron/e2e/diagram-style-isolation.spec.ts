import { _electron as electron, expect, test } from '@playwright/test';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { defaultSettings } from '../../src/lib/settings';
import { definedEnvironment } from './fixtures/environment';

const repoRoot = resolve(import.meta.dirname, '../..');

test('Mermaid diagram styles stay inside their own diagram', async () => {
  const home = await mkdtemp(join(tmpdir(), 'hackdesk-diagram-styles-'));
  const vault = join(home, 'vault');
  await mkdir(join(home, '.hackdesk'), { recursive: true });
  await mkdir(vault);
  await writeFile(join(vault, 'Diagrams.md'), [
    '# Diagrams', '', '```mermaid', 'graph TD', 'A[Start] --> B[Done]', '```', '',
    '```mermaid', 'erDiagram', 'USER ||--o{ NOTE : writes', '```', '',
  ].join('\n'));
  await writeFile(join(home, '.hackdesk', 'settings.json'), JSON.stringify({
    ...defaultSettings, localVault: { vaults: [{ id: 'vault-e2e', path: vault }], activeVaultId: 'vault-e2e' }, onboarding: { hackmdTokenSetupDeferred: true },
  }));
  const env = { ...definedEnvironment(process.env) };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.HACKDESK_ELECTRON_DEV_SERVER_URL;
  const app = await electron.launch({ args: [repoRoot, `--user-data-dir=${join(home, 'user-data')}`, `--hackdesk-home=${home}`], cwd: repoRoot, env });
  const child = app.process();
  try {
    const page = await app.firstWindow();
    const diagrams = page.locator('.cm-hackmd-mermaid-preview svg');
    await expect(diagrams).toHaveCount(2);

    const result = await page.evaluate(() => {
      const [graph, er] = [...document.querySelectorAll<SVGSVGElement>('.cm-hackmd-mermaid-preview svg')];
      const outside = document.body.appendChild(document.createElementNS('http://www.w3.org/2000/svg', 'svg'));
      outside.classList.add('pele');
      const line = (element: Element) => getComputedStyle(element).getPropertyValue('--_l').trim();
      return {
        diagramLines: [line(graph), line(er)],
        outsideLine: line(outside),
        // The theme reaches each diagram through the --pele-* variables on its block.
        themedLine: line(graph) === getComputedStyle(graph.closest('.cm-hackmd-mermaid-preview')!).getPropertyValue('--pele-line').trim(),
        styleElements: document.querySelectorAll('.cm-hackmd-mermaid-preview style').length,
      };
    });

    // Each diagram gets its theme variables, from the HackDesk theme rather than Pele's defaults.
    expect(result.diagramLines.every(Boolean)).toBe(true);
    expect(result.themedLine).toBe(true);
    // Nothing reaches an SVG outside the diagrams, even one with Pele's class.
    expect(result.outsideLine).toBe('');
    // Pele styles each diagram inline; no stylesheet can reach the workbench.
    expect(result.styleElements).toBe(0);
  } finally {
    child.kill('SIGKILL');
  }
});
