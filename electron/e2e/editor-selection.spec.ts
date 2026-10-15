import { _electron as electron, expect, test } from '@playwright/test';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { defaultSettings } from '../../src/lib/settings';
import { definedEnvironment } from './fixtures/environment';

const repoRoot = resolve(import.meta.dirname, '../..');

for (const theme of ['light', 'dark'] as const) {
  test(`editor selections use the theme tint and keep the text color in ${theme}`, async () => {
    const home = await mkdtemp(join(tmpdir(), 'hackdesk-selection-'));
    const vault = join(home, 'vault');
    await mkdir(join(home, '.hackdesk'), { recursive: true });
    await mkdir(vault);
    await writeFile(join(vault, 'Select.md'), '# Select\n\nselect this text\n');
    await writeFile(join(home, '.hackdesk', 'settings.json'), JSON.stringify({
      ...defaultSettings,
      appearance: { ...defaultSettings.appearance, theme },
      localVault: { path: vault },
      onboarding: { hackmdTokenSetupDeferred: true },
    }));
    const env = { ...definedEnvironment(process.env) };
    delete env.ELECTRON_RUN_AS_NODE;
    delete env.HACKDESK_ELECTRON_DEV_SERVER_URL;
    const app = await electron.launch({ args: [repoRoot, `--user-data-dir=${join(home, 'user-data')}`, `--hackdesk-home=${home}`], cwd: repoRoot, env });
    const child = app.process();
    try {
      const page = await app.firstWindow();
      const line = page.locator('.cm-line', { hasText: 'select this text' });
      await line.click();
      await page.keyboard.press('Home');
      await page.keyboard.press('Shift+End');
      await expect(page.locator('.cm-selectionBackground').first()).toBeVisible();

      const colors = await line.evaluate((element) => {
        const probe = document.body.appendChild(document.createElement('div'));
        probe.style.backgroundColor = 'color-mix(in srgb, var(--primary-default) 24%, transparent)';
        const expected = getComputedStyle(probe).backgroundColor;
        probe.remove();
        return {
          expected,
          selection: getComputedStyle(document.querySelector('.cm-selectionBackground')!).backgroundColor,
          text: getComputedStyle(element).color,
          selectedText: getComputedStyle(element, '::selection').color,
        };
      });

      expect(colors.selection).toBe(colors.expected);
      expect(colors.selectedText).toBe(colors.text);
    } finally {
      child.kill('SIGKILL');
    }
  });
}
