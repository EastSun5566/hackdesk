import { _electron as electron, expect, test } from '@playwright/test';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { defaultSettings } from '../../src/lib/settings';

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
    ...defaultSettings, localVault: { path: vault }, onboarding: { hackmdTokenSetupDeferred: true },
  }));
  const env = { ...process.env };
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
      const ns = 'http://www.w3.org/2000/svg';
      const monoText = (parent: Element) => {
        const text = parent.appendChild(document.createElementNS(ns, 'text'));
        text.classList.add('mono');
        return text;
      };
      // Probes outside any diagram, and in each diagram. Only the ER diagram ships a `.mono` rule.
      const outside = document.body.appendChild(document.createElementNS(ns, 'svg'));
      const outsideText = monoText(outside);
      const graphMono = monoText(graph);
      const erMono = monoText(er);
      const line = (element: Element) => getComputedStyle(element).getPropertyValue('--_line').trim();
      const font = (element: Element) => getComputedStyle(element).fontFamily;
      return {
        diagramLines: [line(graph), line(er)],
        outsideLine: line(outside),
        outsideFont: font(outsideText),
        graphMonoFont: font(graphMono),
        erMonoFont: font(erMono),
        imports: [...document.querySelectorAll('.cm-hackmd-mermaid-preview style')].some((style) => style.textContent?.includes('@import')),
      };
    });

    // Each diagram still gets its theme variables.
    expect(result.diagramLines.every(Boolean)).toBe(true);
    // Nothing reaches an SVG outside the diagrams.
    expect(result.outsideLine).toBe('');
    expect(result.outsideFont).not.toContain('JetBrains Mono');
    expect(result.outsideFont).not.toContain('var(--font-sans)');
    // One diagram's rules do not reach another diagram.
    expect(result.erMonoFont).toContain('JetBrains Mono');
    expect(result.graphMonoFont).not.toContain('JetBrains Mono');
    expect(result.imports).toBe(false);
  } finally {
    child.kill('SIGKILL');
  }
});
