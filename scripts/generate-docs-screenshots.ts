/**
 * Generates the README and documentation homepage workbench screenshots in every combination of
 * platform window chrome (macOS with traffic lights, Windows/Linux with HackDesk's custom title
 * bar) and theme (light and dark).
 *
 *   pnpm docs:screenshots
 *   pnpm docs:screenshots --platforms macos --modes dark
 *   pnpm docs:screenshots --out .local/docs-screenshots
 *
 * Runs headlessly in the background (HACKDESK_E2E_BACKGROUND=1) against a throwaway home directory
 * and local vault so it never touches real settings or steals window focus.
 */
import { _electron as electron, type Page } from '@playwright/test';
import { mkdir, mkdtemp, realpath, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { createServer } from 'vite';
import { buildTargets } from './electron-build.ts';

const repoRoot = path.resolve(import.meta.dirname, '..');

type ShowcasePlatform = 'macos' | 'windows-linux';
type ShowcaseMode = 'light' | 'dark';

const PLATFORMS: Record<ShowcasePlatform, 'darwin' | 'linux'> = {
  macos: 'darwin',
  'windows-linux': 'linux',
};

const MODES: ShowcaseMode[] = ['light', 'dark'];

const DEMO_FILES: Record<string, string> = {
  'Ideas/Reading notes.md': `# Reading notes

Short notes collected while planning the guide.

- Keep examples small and concrete.
- Link related pages instead of repeating setup steps.
`,
  'Projects/Project plan.md': `# Project plan

A small documentation site for a fictional project.

## This week

- [x] Sketch the outline
- [ ] Review the examples
- [ ] Share the first draft

## Writing principles

Keep each page focused on one reader task. Use short steps and concrete examples.

> Make the next action easy to find.

\`\`\`ts
const next = ["write", "review", "share"];
\`\`\`
`,
  'Projects/Release checklist.md': `# Release checklist

A checklist for our fictional project.

## Before sharing

- [x] Check the links
- [x] Review the examples
- [ ] Ask a friend to try the guide

## Follow up

Collect questions and improve the steps.

:::info
Start small. Publish when the first task is easy to finish.
:::
`,
  'Reference/Writing guide.md': `# Writing guide

Use active sentences and keep each heading tied to one task.
`,
};

const DEMO_TIMESTAMP = new Date('2026-11-20T12:00:00Z');

const { values } = parseArgs({
  options: {
    platforms: { type: 'string', default: 'macos,windows-linux' },
    modes: { type: 'string', default: 'light,dark' },
    out: { type: 'string', default: path.join(repoRoot, 'docs/public') },
    width: { type: 'string', default: '1440' },
    height: { type: 'string', default: '900' },
  },
});

const selectedPlatforms = values.platforms.split(',').filter(Boolean) as ShowcasePlatform[];
for (const platform of selectedPlatforms) {
  if (!(platform in PLATFORMS)) {
    throw new Error(`--platforms must only contain ${Object.keys(PLATFORMS).join(', ')}.`);
  }
}
const selectedModes = values.modes.split(',').filter(Boolean) as ShowcaseMode[];
for (const mode of selectedModes) {
  if (!MODES.includes(mode)) {
    throw new Error(`--modes must only contain ${MODES.join(', ')}.`);
  }
}

const width = Number(values.width);
const height = Number(values.height);

async function setupDemoVault(home: string, mode: ShowcaseMode) {
  const rawVault = path.join(home, 'Studio notes');
  await mkdir(path.join(home, '.hackdesk'), { recursive: true });
  await mkdir(rawVault, { recursive: true });
  const vault = await realpath(rawVault);

  for (const [relativePath, content] of Object.entries(DEMO_FILES)) {
    const fullPath = path.join(vault, relativePath);
    await mkdir(path.dirname(fullPath), { recursive: true });
    await writeFile(fullPath, content);
    await utimes(fullPath, DEMO_TIMESTAMP, DEMO_TIMESTAMP);
  }

  await writeFile(
    path.join(home, '.hackdesk', 'settings.json'),
    JSON.stringify({
      appearance: { theme: mode, presetId: 'hackmd-neo', customSeed: {} },
      localVault: {
        vaults: [{ id: 'studio-notes', path: vault }],
        activeVaultId: 'studio-notes',
        workspaces: [{ id: 'writing-desk', name: 'Writing desk', vaultIds: ['studio-notes'] }],
        activeWorkspaceId: 'writing-desk',
      },
      onboarding: { hackmdTokenSetupDeferred: true },
    }),
  );
}

async function ensureFolderExpanded(page: Page, name: string) {
  const folder = page.locator('aside').getByRole('treeitem', { name: new RegExp(`^${name}\\b`) }).first();
  await folder.waitFor({ timeout: 15_000 });
  if (await folder.getAttribute('aria-expanded') === 'false') {
    await folder.click();
    await page.waitForTimeout(150);
  }
}

async function openSidebarNote(page: Page, title: string, { keep = false } = {}) {
  const item = page.locator('aside').getByRole('treeitem', { name: new RegExp(`^${title}\\b`) }).first();
  await item.waitFor({ timeout: 15_000 });
  if (keep) {
    await item.dblclick();
  } else {
    await item.click();
  }
  await page.waitForTimeout(250);
}

/**
 * Playwright's page.screenshot() captures Chromium's web contents only, omitting native macOS
 * NSWindow traffic lights. Paint the exact three active window controls at the native
 * trafficLightPosition ({ x: 16, y: 12 }, 12px buttons centered vertically in the 40px title bar)
 * so the top-left inset isn't left blank.
 */
async function injectMacOsTrafficLights(page: Page, mode: ShowcaseMode) {
  await page.evaluate((themeMode) => {
    const existing = document.getElementById('hackdesk-screenshot-traffic-lights');
    existing?.remove();

    const container = document.createElement('div');
    container.id = 'hackdesk-screenshot-traffic-lights';
    container.setAttribute('aria-hidden', 'true');
    Object.assign(container.style, {
      position: 'fixed',
      left: '16px',
      top: '14px',
      zIndex: '9999',
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      pointerEvents: 'none',
    });

    const ring = themeMode === 'dark'
      ? 'inset 0 0 0 0.5px rgba(255, 255, 255, 0.12), 0 0.5px 1px rgba(0, 0, 0, 0.35)'
      : 'inset 0 0 0 0.5px rgba(0, 0, 0, 0.14)';

    for (const color of ['#FF5F57', '#FEBC2E', '#28C840']) {
      const dot = document.createElement('span');
      Object.assign(dot.style, {
        width: '12px',
        height: '12px',
        borderRadius: '9999px',
        backgroundColor: color,
        boxShadow: ring,
        display: 'block',
      });
      container.appendChild(dot);
    }

    document.body.appendChild(container);
  }, mode);
}

type EditorViewLike = {
  dispatch: (spec: Record<string, unknown>) => void;
  state: { doc: { toString: () => string } };
};

function placeCursorAt(content: Element, text: string): boolean {
  const view = (content as Element & { cmTile?: { root?: { view?: EditorViewLike } } }).cmTile?.root?.view;
  if (!view) return false;
  const position = view.state.doc.toString().indexOf(text);
  if (position < 0) return false;
  view.dispatch({ selection: { anchor: position } });
  return true;
}

async function captureVariant(
  devServerUrl: string,
  platform: ShowcasePlatform,
  mode: ShowcaseMode,
  outDir: string,
) {
  const home = await mkdtemp(path.join(tmpdir(), `hackdesk-docs-shot-${platform}-${mode}-`));
  await setupDemoVault(home, mode);

  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) env[key] = value;
  }
  delete env.ELECTRON_RUN_AS_NODE;
  env.HOME = home;
  env.LANG = 'en_US.UTF-8';
  env.LC_ALL = 'en_US.UTF-8';
  env.HACKDESK_E2E_BACKGROUND = '1';
  env.HACKDESK_ELECTRON_DEV_SERVER_URL = devServerUrl;
  env.HACKDESK_RENDERER_PLATFORM = PLATFORMS[platform];

  const app = await electron.launch({
    args: [repoRoot, '--lang=en-US', `--hackdesk-home=${home}`, `--user-data-dir=${path.join(home, 'user-data')}`],
    cwd: repoRoot,
    env,
  });

  try {
    const page = await app.firstWindow();
    page.on('console', (message) => {
      if (message.type() === 'error') console.error(`[renderer] ${message.text()}`);
    });
    await page.setViewportSize({ width, height });
    // Keep the sidebar opaque so screenshots are identical regardless of desktop wallpaper.
    await page.evaluate(() => window.localStorage.setItem('hackdesk_sidebar_translucency', 'off'));
    await page.reload();

    await page.getByRole('button', { name: /^Switch workspace, current: Writing desk/ }).waitFor({ timeout: 20_000 });
    await ensureFolderExpanded(page, 'Ideas');
    await ensureFolderExpanded(page, 'Projects');
    await ensureFolderExpanded(page, 'Reference');

    // Open all three notes in the left pane, then split Release checklist to the right pane so the
    // left pane shows Reading notes + Project plan and the right pane shows Release checklist.
    await openSidebarNote(page, 'Reading notes', { keep: true });
    await openSidebarNote(page, 'Project plan', { keep: true });
    await openSidebarNote(page, 'Release checklist', { keep: true });

    // Split right via the active pane's layout menu so it works identically on every emulated OS.
    await page.getByRole('button', { name: 'Pane actions' }).first().click();
    await page.getByRole('menuitem', { name: 'Split Right' }).click();
    await page.locator('.cm-content').nth(1).waitFor({ timeout: 15_000 });
    await page.waitForTimeout(300);

    // Move cursors off line 1 so the H1 titles render in live preview without raw `# ` syntax.
    await page.locator('.cm-content').nth(0).evaluate(placeCursorAt, 'A small documentation site');
    await page.locator('.cm-content').nth(1).evaluate(placeCursorAt, 'A checklist for our fictional project.');

    // Activate the left pane (Project plan) so the sidebar selection and active pane match.
    await page.getByRole('tab', { name: /Project plan/ }).first().click();
    await page.waitForTimeout(300);

    // Clear focus and hover so no focus ring, cursor caret, or tooltip sits over the scene.
    await page.evaluate(() => {
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    });
    await page.mouse.move(0, 0);
    await page.waitForTimeout(600);

    if (platform === 'macos') {
      await injectMacOsTrafficLights(page, mode);
    }

    const file = path.join(outDir, `editor-${platform}-${mode}.png`);
    await page.screenshot({ path: file, animations: 'disabled' });
    console.log(file);
  } finally {
    await app.close().catch(() => app.process().kill('SIGKILL'));
    await rm(home, { recursive: true, force: true }).catch(() => undefined);
  }
}

await mkdir(values.out, { recursive: true });
await buildTargets();

const server = await createServer({
  root: repoRoot,
  logLevel: 'error',
  server: { host: 'localhost', port: 0, strictPort: false },
});
await server.listen();
const address = server.httpServer?.address();
if (!address || typeof address === 'string') throw new Error('No dev server address.');
const devServerUrl = `http://localhost:${address.port}`;

try {
  for (const platform of selectedPlatforms) {
    for (const mode of selectedModes) {
      await captureVariant(devServerUrl, platform, mode, values.out);
    }
  }
} finally {
  await server.close();
}
