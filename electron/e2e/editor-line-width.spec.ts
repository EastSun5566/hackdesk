import { _electron as electron, expect, test } from '@playwright/test';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { defaultSettings } from '../../src/lib/settings';
import { definedEnvironment } from './fixtures/environment';

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
  const env = { ...definedEnvironment(process.env) };
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
      const scroller = line.closest('.cm-scroller')!;
      const probe = document.body.appendChild(document.createElement('span'));
      probe.style.cssText = `position:absolute;visibility:hidden;white-space:pre;font:${getComputedStyle(content).font}`;
      probe.textContent = '0'.repeat(90);
      const columnWidth = probe.getBoundingClientRect().width;
      probe.remove();
      const box = scroller.getBoundingClientRect();
      const text = line.getBoundingClientRect();
      // clientWidth leaves out the vertical scrollbar.
      return { columnWidth, width: text.width, left: text.left - box.left, right: box.left + scroller.clientWidth - text.right };
    });
    // CSS layout should not depend on CI's virtual screen clamping a native window.
    const resize = (width: number) => page.setViewportSize({ width, height: 900 });

    await resize(1100);
    await expect.poll(async () => {
      const { width, columnWidth } = await measure();
      return width < columnWidth - 2;
    }).toBe(true);
    const narrow = await measure();
    expect(narrow.left).toBeGreaterThanOrEqual(20);
    expect(narrow.right).toBeGreaterThanOrEqual(20);

    await resize(2400);
    await expect.poll(async () => (await measure()).left).toBeGreaterThan(200);
    const wide = await measure();
    expect(Math.abs(wide.width - wide.columnWidth)).toBeLessThanOrEqual(2);
    expect(Math.abs(wide.left - wide.right)).toBeLessThanOrEqual(2);

    // Clicking the empty margin still places the cursor on that line.
    await page.locator('.cm-content').click();
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+ArrowUp' : 'Control+Home');
    const box = (await paragraph.boundingBox())!;
    const scroller = (await page.locator('.cm-scroller').boundingBox())!;
    await page.mouse.click(scroller.x + 10, box.y + 4);
    await page.keyboard.type('X');
    await expect(paragraph).toHaveText(/^Xword word/);
    await page.keyboard.press('Backspace');

    // A selection across whole wrapped lines stays inside the column.
    await page.keyboard.press('Shift+ArrowDown');
    await page.keyboard.press('Shift+ArrowDown');
    const selection = await page.evaluate(() => {
      const element = document.querySelector('.cm-content')!;
      const content = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      const rects = [...document.querySelectorAll('.cm-selectionBackground')].map((rect) => rect.getBoundingClientRect());
      return {
        count: rects.length,
        left: Math.min(...rects.map((rect) => rect.left)) - content.left,
        right: content.right - Math.max(...rects.map((rect) => rect.right)),
        padding: Math.max(Number.parseFloat(style.paddingLeft), Number.parseFloat(style.paddingRight)),
      };
    });
    expect(selection.count).toBeGreaterThan(0);
    expect(selection.left).toBeGreaterThanOrEqual(0);
    expect(selection.right).toBeGreaterThanOrEqual(0);
    // CodeMirror fills whole-line selections out to the content box, so the box
    // itself must stay close to the column instead of spanning the pane.
    expect(selection.padding).toBeLessThanOrEqual(48);
  } finally {
    child.kill('SIGKILL');
  }
});
