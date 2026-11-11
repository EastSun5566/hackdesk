import { _electron as electron, expect, test as base, type ElectronApplication, type Page } from '@playwright/test';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import { defaultSettings } from '../../../src/lib/settings';
import { definedEnvironment } from './environment';

const repoRoot = resolve(import.meta.dirname, '../../..');
const fakeHackmdEntry = join(repoRoot, 'electron/e2e/fixtures/fake-hackmd.cjs');

export const primary = process.platform === 'darwin' ? 'Meta' : 'Control';

export type FakeHackmdRequest = {
  method: string;
  path: string;
  search: string;
  authorization: string | null;
  ifNoneMatch: string | null;
  body: unknown;
};

export type LaunchOptions = {
  /** settings.json contents; `null` starts like a fresh install, with no settings file. */
  settings?: Record<string, unknown> | null;
  /** Markdown files to create, keyed by their path inside the vault. Adds the vault to settings. */
  vault?: Record<string, string>;
  /** Runs the real main process against the in-memory HackMD in fake-hackmd.cjs. */
  fakeHackmd?: boolean;
};

export type HackDesk = {
  app: ElectronApplication;
  page: Page;
  home: string;
  vault: string;
  settingsPath: string;
  readSettings: () => Promise<Record<string, unknown>>;
  hackmdRequests: () => Promise<FakeHackmdRequest[]>;
  /** Quits like a user would and starts again with the same home, vault and fake HackMD state. */
  restart: () => Promise<HackDesk>;
};

type Launch = (options?: LaunchOptions) => Promise<HackDesk>;

/**
 * Quits through the app's own close flow; Playwright's `app.close()` never returns while HackDesk
 * asks to confirm closing. With unsaved drafts HackDesk keeps them for the next launch and asks
 * first, so this confirms like a user when asked and waits for the process to exit.
 */
async function quit(app: ElectronApplication, page: Page) {
  const child = app.process();
  const exited = new Promise<void>(resolve => {
    if (child.exitCode !== null || child.signalCode !== null) resolve();
    else child.once('exit', () => resolve());
  });
  await app.evaluate(({ app: electronApp }) => {
    setImmediate(() => electronApp.quit());
  });
  const confirmation = page.getByRole('alertdialog', { name: /^Close HackDesk/ });
  const outcome = await Promise.race([
    exited.then(() => 'exited' as const),
    confirmation.waitFor({ state: 'visible', timeout: 15_000 }).then(
      () => 'confirmation' as const,
      // The page closing first is a normal quit; wait for the process below.
      () => 'closed' as const,
    ),
  ]);
  if (outcome === 'confirmation') {
    await confirmation.getByRole('button', { name: 'Close', exact: true }).click();
  }
  await exited;
}

function environment(home: string) {
  const env = definedEnvironment(process.env);
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.HACKDESK_ELECTRON_DEV_SERVER_URL;
  // Local Vault uses the OS trash. On Linux that follows XDG_DATA_HOME, so trashed test files
  // stay in the test home instead of the developer's Trash.
  if (process.platform === 'linux') env.XDG_DATA_HOME = join(home, 'xdg-data');
  return env;
}

export const test = base.extend<{ hackdesk: Launch }>({
  // Playwright reads fixture dependencies from the destructured first argument; this one has none.
  // oxlint-disable-next-line no-empty-pattern
  hackdesk: async ({}, provide) => {
    const processes: ReturnType<ElectronApplication['process']>[] = [];

    const start = async (home: string, vault: string, fakeHackmd: boolean): Promise<HackDesk> => {
      const entry = fakeHackmd ? fakeHackmdEntry : repoRoot;
      const app = await electron.launch({
        args: [entry, `--hackdesk-home=${home}`, `--user-data-dir=${join(home, 'user-data')}`],
        cwd: repoRoot,
        env: environment(home),
      });
      processes.push(app.process());
      const page = await app.firstWindow();
      await page.emulateMedia({ reducedMotion: 'reduce' });
      const settingsPath = join(home, '.hackdesk', 'settings.json');
      return {
        app,
        page,
        home,
        vault,
        settingsPath,
        readSettings: async () => JSON.parse(await readFile(settingsPath, 'utf8')) as Record<string, unknown>,
        hackmdRequests: async () => {
          const log = await readFile(join(home, 'fake-hackmd-requests.jsonl'), 'utf8').catch(() => '');
          return log.split('\n').filter(Boolean).map(line => JSON.parse(line) as FakeHackmdRequest);
        },
        restart: async () => {
          await quit(app, page);
          return start(home, vault, fakeHackmd);
        },
      };
    };

    await provide(async ({ settings, vault: files, fakeHackmd = false } = {}) => {
      const home = await mkdtemp(join(tmpdir(), 'hackdesk-e2e-'));
      const vault = join(home, 'vault');
      await mkdir(join(home, '.hackdesk'), { recursive: true });
      if (files) {
        await mkdir(vault, { recursive: true });
        for (const [path, content] of Object.entries(files)) {
          await mkdir(dirname(join(vault, path)), { recursive: true });
          await writeFile(join(vault, path), content);
        }
      }
      const resolvedSettings = settings === null
        ? null
        : {
          ...defaultSettings,
          ...(files ? { localVault: { path: vault }, onboarding: { hackmdTokenSetupDeferred: true } } : {}),
          ...settings,
        };
      if (resolvedSettings) {
        await writeFile(join(home, '.hackdesk', 'settings.json'), JSON.stringify(resolvedSettings));
      }
      return start(home, vault, fakeHackmd);
    });

    for (const child of processes) {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    }
  },
});

export { expect };

/** Runs a command by name from the command palette. */
export async function runCommand(page: Page, label: string) {
  // Only an open palette counts. The one closed by the previous command can still be in the page
  // while it finishes closing, and in a window without focus that can take seconds.
  const palette = page.locator('[role="dialog"]:not([data-closed])');
  const search = palette.getByRole('combobox', { name: 'Search notes, folders, and commands' });
  // Right after launch the window can take the key before its shortcuts are listening.
  await expect(async () => {
    if (!(await search.isVisible())) await page.keyboard.press(`${primary}+Shift+P`);
    await expect(search).toBeVisible({ timeout: 1000 });
  }).toPass();
  await search.fill(label);
  const option = palette.getByRole('option', { name: new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`) }).first();
  try {
    await option.click({ timeout: 10_000 });
  } catch (error) {
    const suggestions = await palette.getByRole('listbox').ariaSnapshot({ timeout: 1000 }).catch(() => '(no suggestions)');
    throw new Error(`The palette offered no "${label}" command. It showed:\n${suggestions}`, { cause: error });
  }
}
