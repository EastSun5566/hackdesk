/**
 * Startup time and memory of the main window and the Quick Hack window, in the built app.
 * See benchmarks/route-startup/README.md.
 *
 *   pnpm run build
 *   node scripts/benchmark-route-startup.ts --runs=7 --output=.local/benchmarks/route-startup/after.json
 */
import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const repoRoot = resolve(import.meta.dirname, '..');

type Scenario = 'main' | 'quick-capture';
type Sample = {
  /** `main` and `quick-capture-launch` start the app; `quick-capture-open` opens the popup in a running one. */
  scenario: 'main' | 'quick-capture-launch' | 'quick-capture-open';
  run: 'cold' | 'warm' | 'first' | 'again';
  /** Milliseconds from the window's navigation start, read from the renderer's performance timeline. */
  domContentLoaded: number;
  firstContentfulPaint: number | null;
  /** The route's first meaningful UI: the workspace switcher, or the Quick Hack editor. */
  ready: number;
  /** Resident memory of the window's renderer process (KiB, from app.getAppMetrics()). */
  rendererWorkingSetKiB: number;
  /** Renderer JS heap after a settle period (bytes, performance.memory). */
  rendererJsHeapBytes: number;
};

const READY_SELECTOR: Record<Scenario, string> = {
  main: '[aria-label^="Switch workspace"]',
  'quick-capture': '.cm-content',
};

const ROUTE_FRAGMENT: Record<Scenario, string> = {
  main: '#/electron',
  'quick-capture': '#/quick-capture',
};

function option(name: string, fallback: string) {
  const prefix = `--${name}=`;
  return process.argv.slice(2).find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ?? fallback;
}

async function createProfile() {
  const home = await mkdtemp(join(tmpdir(), 'hackdesk-route-startup-'));
  const vault = join(home, 'vault');
  await mkdir(join(home, '.hackdesk'), { recursive: true });
  await mkdir(vault, { recursive: true });
  await writeFile(join(vault, 'Welcome.md'), '# Welcome\n\nA note.\n');
  // Missing settings take their defaults when HackDesk reads the file.
  await writeFile(join(home, '.hackdesk', 'settings.json'), JSON.stringify({
    localVault: { vaults: [{ id: 'vault-bench', path: vault }], activeVaultId: 'vault-bench' },
  }));
  return { home, userData: join(home, 'user-data') };
}

function launch(profile: { home: string; userData: string }, quickCapture: boolean) {
  return electron.launch({
    args: [
      repoRoot,
      `--user-data-dir=${profile.userData}`,
      `--hackdesk-home=${profile.home}`,
      ...(quickCapture ? ['--quick-capture'] : []),
    ],
    cwd: repoRoot,
    // Background windows (see e2e-background-windows.ts) keep the run off the screen and keyboard.
    env: { ...process.env, HOME: profile.home, HACKDESK_E2E_BACKGROUND: '1' },
  });
}

async function waitForPage(app: ElectronApplication, fragment: string) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const page = app.windows().find((candidate) => candidate.url().includes(fragment));
    if (page) return page;
    await app.waitForEvent('window', { timeout: 1_000 }).catch(() => undefined);
  }
  throw new Error(`No window for ${fragment}`);
}

/**
 * Installed in every window before its scripts run (Playwright's init script), so the time the
 * selector appears is recorded against the window's own navigation start however late the harness
 * reads it.
 */
function recordReady(selectors: string[]) {
  const target = window as unknown as { __routeReadyAt?: number };
  const check = () => {
    if (target.__routeReadyAt !== undefined) return true;
    if (!selectors.some((selector) => document.querySelector(selector))) return false;
    target.__routeReadyAt = performance.now();
    return true;
  };
  const observer = new MutationObserver(() => {
    if (check()) observer.disconnect();
  });
  observer.observe(document, { childList: true, subtree: true, attributes: true });
}

async function measure(page: Page, selector: string) {
  await page.waitForSelector(selector, { state: 'attached', timeout: 30_000 });
  return page.evaluate(() => {
    const [navigation] = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
    const paint = performance.getEntriesByName('first-contentful-paint')[0];
    return {
      domContentLoaded: navigation?.domContentLoadedEventEnd ?? Number.NaN,
      firstContentfulPaint: paint ? paint.startTime : null,
      ready: (window as unknown as { __routeReadyAt?: number }).__routeReadyAt ?? Number.NaN,
    };
  });
}

async function memory(app: ElectronApplication, page: Page) {
  await new Promise((resolveSettle) => setTimeout(resolveSettle, 1_500));
  const jsHeap = await page.evaluate(() => (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? 0);
  const url = page.url();
  const workingSet = await app.evaluate(({ app: electronApp, BrowserWindow }, pageUrl) => {
    const window = BrowserWindow.getAllWindows().find((candidate) => candidate.webContents.getURL() === pageUrl);
    const pid = window?.webContents.getOSProcessId();
    return electronApp.getAppMetrics().find((metric) => metric.pid === pid)?.memory.workingSetSize ?? 0;
  }, url);
  return { rendererWorkingSetKiB: workingSet, rendererJsHeapBytes: jsHeap };
}

async function sampleLaunch(scenario: Scenario, run: 'cold' | 'warm', profile: { home: string; userData: string }) {
  const app = await launch(profile, scenario === 'quick-capture');
  try {
    await app.context().addInitScript(recordReady, Object.values(READY_SELECTOR));
    const page = await waitForPage(app, ROUTE_FRAGMENT[scenario]);
    const timing = await measure(page, READY_SELECTOR[scenario]);
    if (Number.isNaN(timing.ready)) {
      throw new Error(`${scenario}: ${READY_SELECTOR[scenario]} appeared before the init script ran`);
    }
    const sample: Sample = {
      scenario: scenario === 'main' ? 'main' : 'quick-capture-launch',
      run,
      ...timing,
      ...(await memory(app, page)),
    };
    return sample;
  } finally {
    await app.close().catch(() => app.process().kill('SIGKILL'));
  }
}

/**
 * The usual way the popup opens: the app is already running with its main window loaded, and the
 * shortcut creates the Quick Hack window. A harness cannot press a global shortcut, so it creates a
 * window like WindowManager.showQuickCaptureWindow does (same preload, sandbox and URL). The window
 * manager does not know it, so its IPC calls are refused; the renderer still loads and renders the
 * same modules. `first` is the first popup in the process, `again` a second one after it closed.
 */
async function samplePopupOpen(profile: { home: string; userData: string }) {
  const app = await launch(profile, false);
  const samples: Sample[] = [];
  try {
    await app.context().addInitScript(recordReady, Object.values(READY_SELECTOR));
    const main = await waitForPage(app, ROUTE_FRAGMENT.main);
    await main.waitForSelector(READY_SELECTOR.main, { state: 'attached', timeout: 30_000 });
    await new Promise((resolveSettle) => setTimeout(resolveSettle, 2_000));

    for (const run of ['first', 'again'] as const) {
      const opened = app.waitForEvent('window');
      await app.evaluate(({ app: electronApp, BrowserWindow }) => {
        const mainWindow = BrowserWindow.getAllWindows().find((window) => window.webContents.getURL().includes('#/electron'))!;
        const window = new BrowserWindow({
          width: 480,
          height: 320,
          show: false,
          webPreferences: {
            preload: `${electronApp.getAppPath()}/electron/dist/quick-capture-preload.cjs`,
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
          },
        });
        window.once('ready-to-show', () => window.showInactive());
        void window.loadURL(mainWindow.webContents.getURL().replace(/#.*$/, '#/quick-capture'));
      });
      const page = await opened;
      const timing = await measure(page, READY_SELECTOR['quick-capture']);
      samples.push({ scenario: 'quick-capture-open', run, ...timing, ...(await memory(app, page)) });
      await page.close();
    }
    return samples;
  } finally {
    await app.close().catch(() => app.process().kill('SIGKILL'));
  }
}

function median(values: number[]) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

async function main() {
  const runs = Number(option('runs', '5'));
  const output = option('output', '');
  const samples: Sample[] = [];

  for (let index = 0; index < runs; index += 1) {
    for (const scenario of ['main', 'quick-capture'] as const) {
      // Cold: a new profile, so Chromium has no code cache for the renderer bundle yet.
      // Warm: the same profile launched again, with that cache filled.
      const profile = await createProfile();
      try {
        samples.push(await sampleLaunch(scenario, 'cold', profile));
        samples.push(await sampleLaunch(scenario, 'warm', profile));
        if (scenario === 'main') samples.push(...await samplePopupOpen(profile));
      } finally {
        await rm(profile.home, { recursive: true, force: true });
      }
    }
  }

  const groups = [...new Set(samples.map((sample) => `${sample.scenario} ${sample.run}`))];
  const summary = groups.map((key) => {
    const group = samples.filter((sample) => `${sample.scenario} ${sample.run}` === key);
    const [scenario, run] = key.split(' ');
    const fcp = group.map((sample) => sample.firstContentfulPaint).filter((value): value is number => value !== null);
    return {
      scenario,
      run,
      samples: group.length,
      domContentLoadedMs: Math.round(median(group.map((sample) => sample.domContentLoaded))),
      firstContentfulPaintMs: fcp.length ? Math.round(median(fcp)) : null,
      readyMs: Math.round(median(group.map((sample) => sample.ready))),
      rendererWorkingSetMiB: Number((median(group.map((sample) => sample.rendererWorkingSetKiB)) / 1024).toFixed(1)),
      rendererJsHeapMiB: Number((median(group.map((sample) => sample.rendererJsHeapBytes)) / 1024 / 1024).toFixed(1)),
    };
  });

  console.table(summary);
  if (output) {
    await mkdir(dirname(resolve(output)), { recursive: true });
    await writeFile(output, `${JSON.stringify({ summary, samples }, null, 2)}\n`);
  }
}

await main();
