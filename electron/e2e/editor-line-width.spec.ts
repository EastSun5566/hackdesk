import { _electron as electron, expect, test } from '@playwright/test';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { defaultSettings } from '../../src/lib/settings';

const repoRoot = resolve(import.meta.dirname, '../..');

test('editor text stays in a centered, readable column', async () => {
  const home = await mkdtemp(join(tmpdir(), 'hackdesk-line-width-'));
  const vault = join(home, 'vault');
  await mkdir(join(home, '.hackdesk'), { recursive: true });
  await mkdir(vault);
  await writeFile(join(vault, 'Wide.md'), ['# Wide', '', 'word '.repeat(400).trim(), ''].join('\n'));
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
    const paragraph = page.locator('.cm-line', { hasText: 'word word' }).first();
    await expect(paragraph).toBeVisible();

    const measure = () => paragraph.evaluate((line) => {
      const content = line.closest('.cm-content')!;
      const probe = document.body.appendChild(document.createElement('span'));
      probe.style.cssText = `position:absolute;visibility:hidden;white-space:pre;font:${getComputedStyle(content).font}`;
      probe.textContent = '0'.repeat(90);
      const columnWidth = probe.getBoundingClientRect().width;
      probe.remove();
      const box = content.getBoundingClientRect();
      const text = line.getBoundingClientRect();
      return { columnWidth, width: text.width, left: text.left - box.left, right: box.right - text.right };
    });
    const resize = (width: number) => app.evaluate(({ BrowserWindow }, size) => {
      BrowserWindow.getAllWindows()[0].setContentSize(size, 900);
    }, width);

    await resize(2400);
    await expect.poll(async () => (await measure()).left).toBeGreaterThan(200);
    const wide = await measure();
    expect(Math.abs(wide.width - wide.columnWidth)).toBeLessThanOrEqual(2);
    expect(Math.abs(wide.left - wide.right)).toBeLessThanOrEqual(2);

    // Clicking the empty margin still places the cursor on that line.
    const box = (await paragraph.boundingBox())!;
    await page.mouse.click(box.x - 40, box.y + 4);
    const cursorLine = await page.evaluate(() => {
      const selection = document.getSelection();
      const node = selection?.focusNode;
      const element = node instanceof Element ? node : node?.parentElement;
      return element?.closest('.cm-line')?.textContent?.slice(0, 9) ?? null;
    });
    expect(cursorLine).toBe('word word');

    await resize(1100);
    await expect.poll(async () => (await measure()).width).toBeLessThan(wide.width);
    const narrow = await measure();
    expect(narrow.left).toBeGreaterThanOrEqual(20);
    expect(narrow.right).toBeGreaterThanOrEqual(20);
  } finally {
    child.kill('SIGKILL');
  }
});
