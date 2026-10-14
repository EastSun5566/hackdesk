import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { mkdir, mkdtemp, readFile, rename, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { defaultSettings } from '../../src/lib/settings';
import { LOCAL_IMAGE_PNG } from './fixtures/local-image';

const repoRoot = resolve(import.meta.dirname, '../..');
const primary = process.platform === 'darwin' ? 'Meta' : 'Control';

async function loadImage(page: Page, alt: string, width: number) {
  const image = page.locator(`.cm-hackmd-image-preview img[alt="${alt}"]`);
  await image.scrollIntoViewIfNeeded();
  await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBe(width);
}

async function stop(app: ElectronApplication) {
  if (app.process().exitCode !== null) return;
  const exited = new Promise<void>(done => app.process().once('exit', () => done()));
  app.process().kill('SIGKILL');
  await exited;
}

for (const renderer of ['production', 'development'] as const) {
  test(`local images load safely in the ${renderer} renderer`, async () => {
    const home = await mkdtemp(join(tmpdir(), 'hackdesk-local-images-'));
    const vault = join(home, 'vault');
    await mkdir(join(home, '.hackdesk'));
    await mkdir(join(vault, 'alpha'), { recursive: true });
    await mkdir(join(vault, 'beta'));
    const source = '# Note A\n\n![Vector](image.svg)\n\n![Encoded](../圖%20%23%25.png?size=1#preview)\n\n![Space](<my image.png>)\n\nEnd';
    await writeFile(join(vault, 'alpha', 'Note A.md'), source);
    await writeFile(join(vault, 'beta', 'Note B.md'), '# Note B\n\n![Other](image.svg)');
    await writeFile(join(vault, '圖 #%.png'), LOCAL_IMAGE_PNG);
    await writeFile(join(vault, 'alpha', 'my image.png'), LOCAL_IMAGE_PNG);
    // SVG scripts and event handlers must remain inert, even though vector images are allowed.
    const svg = (width: number) => `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="24" onload="top.svgExecuted=true"><script>top.svgExecuted=true</script><rect width="100%" height="100%" fill="#7c6fd8"/></svg>`;
    await writeFile(join(vault, 'alpha', 'image.svg'), svg(41));
    await writeFile(join(vault, 'beta', 'image.svg'), svg(73));
    await writeFile(join(home, '.hackdesk', 'settings.json'), JSON.stringify({
      ...defaultSettings, localVault: { path: vault }, onboarding: { hackmdTokenSetupDeferred: true },
    }));

    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    delete env.HACKDESK_ELECTRON_DEV_SERVER_URL;
    let server: import('vite').ViteDevServer | undefined;
    let app: ElectronApplication | undefined;
    try {
      if (renderer === 'development') {
        const { createServer } = await import('vite');
        server = await createServer({ root: repoRoot, envDir: home, server: { host: '127.0.0.1', port: 0, strictPort: false } });
        await server.listen();
        const address = server.httpServer!.address();
        if (!address || typeof address === 'string') throw new Error('No dev server address.');
        env.HACKDESK_ELECTRON_DEV_SERVER_URL = `http://127.0.0.1:${address.port}`;
      }
      app = await electron.launch({ args: [repoRoot, `--hackdesk-home=${home}`, `--user-data-dir=${join(home, 'user-data')}`], cwd: repoRoot, env });
      const page = await app.firstWindow();
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.getByRole('treeitem', { name: /Note A/ }).first().click();
      await loadImage(page, 'Vector', 41);
      await loadImage(page, 'Encoded', 1);
      await loadImage(page, 'Space', 1);
      expect(await page.evaluate(() => (window as Window & { svgExecuted?: boolean }).svgExecuted)).toBeUndefined();
      expect(await readFile(join(vault, 'alpha', 'Note A.md'), 'utf8')).toBe(source);

      // Different notes with the same relative image path must never share their URLs or dimensions.
      await page.getByRole('button', { name: 'Pane actions', exact: true }).click();
      await page.getByRole('menuitem', { name: 'Split Right', exact: true }).click();
      await page.getByRole('treeitem', { name: /Note B/ }).first().click();
      await loadImage(page, 'Vector', 41);
      await loadImage(page, 'Other', 73);
      const oldUrl = await page.locator('.cm-hackmd-image-preview img[alt="Vector"]').getAttribute('src');
      const otherUrl = await page.locator('.cm-hackmd-image-preview img[alt="Other"]').getAttribute('src');
      expect(oldUrl).not.toBe(otherUrl);

      const leftEditor = page.locator('.cm-content').first();
      await leftEditor.press('Control+End');
      await leftEditor.press('Enter');
      await page.keyboard.type('Draft preserved');
      await expect(leftEditor).toContainText('Draft preserved');
      await rename(join(vault, 'alpha'), join(vault, 'renamed'));
      await expect.poll(() => page.locator('.cm-hackmd-image-preview img[alt="Vector"]').getAttribute('src')).not.toBe(oldUrl);
      await loadImage(page, 'Vector', 41);
      await expect(leftEditor).toContainText('Draft preserved');
      expect(await page.locator('.cm-hackmd-image-preview img[alt="Other"]').getAttribute('src')).toBe(otherUrl);

      const nextVault = join(home, 'next-vault');
      await mkdir(nextVault);
      await writeFile(join(nextVault, 'Next.md'), '# Next\n\n![Next](image.png)');
      await writeFile(join(nextVault, 'image.png'), LOCAL_IMAGE_PNG);
      await app.evaluate(({ dialog }, path) => {
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
      }, nextVault);
      await page.keyboard.press(`${primary}+,`);
      await page.getByRole('tab', { name: 'Vault', exact: true }).click();
      await page.getByRole('button', { name: 'Change Vault', exact: true }).click();
      await expect(page.getByRole('dialog', { name: 'Settings' }).getByText(nextVault, { exact: true })).toBeVisible();
      await page.keyboard.press('Escape');
      await page.getByRole('treeitem', { name: /Next/ }).first().click();
      await loadImage(page, 'Next', 1);
      expect(await app.evaluate(async ({ net }, url) => (await net.fetch(url)).status, oldUrl!)).toBe(404);
    } finally {
      if (app) await stop(app);
      await server?.close();
    }
  });
}
