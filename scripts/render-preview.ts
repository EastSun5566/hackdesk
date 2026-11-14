/**
 * Render preview: opens one markdown note in a throwaway HackDesk profile and screenshots the editor
 * in light and dark mode. Use it to check a live-preview rendering change in the real app without
 * running the E2E suite.
 *
 *   pnpm render:preview                                   # the bundled sample note
 *   pnpm render:preview --note path/to/note.md            # any note; images beside it are copied too
 *   pnpm render:preview --scroll-to "## Code blocks"      # start the shot at this markdown source text
 *   pnpm render:preview --modes dark --click "Last line"  # put the cursor there (reveals that line's source)
 *   pnpm render:preview --find "link"                     # open find (Cmd/Ctrl+F) and type a query
 *   pnpm render:preview --eval "document.querySelectorAll('.cm-line').length"
 *   pnpm render:preview --window --translucency clear     # macOS: the whole window as the screen shows it
 *
 * Screenshots land in .local/render-preview/<name>-<mode>.png. The script starts its own Vite dev
 * server, so source edits are picked up on every run; it builds the Electron main bundle first.
 * Windows stay in the background (HACKDESK_E2E_BACKGROUND) and never touch your real settings.
 *
 * --window (macOS) brings the window to the front and captures its area of the screen, so the shot has
 * what only the window server draws: the vibrancy material behind a translucent sidebar, the frame and
 * traffic lights. Page screenshots never include those, so they cannot show a translucency bug. It
 * needs an awake, unlocked screen and Screen Recording permission for the terminal.
 */
import { _electron as electron } from '@playwright/test';
import { copyFile, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { parseArgs, promisify } from 'node:util';
import { createServer } from 'vite';
import { buildTargets } from './electron-build.ts';

const repoRoot = path.resolve(import.meta.dirname, '..');

type EditorViewLike = {
  dispatch: (spec: Record<string, unknown>) => void;
  focus: () => void;
  state: { doc: { toString: () => string } };
  constructor: { scrollIntoView: (pos: number, options: Record<string, unknown>) => unknown };
};

// These run in the renderer, serialized on their own, so each reads the view itself: CodeMirror keeps
// it on the content element's tile (what EditorView.findFromDOM reads).
function placeCursorAt(content: Element, text: string): boolean {
  const view = (content as Element & { cmTile: { root: { view: EditorViewLike } } }).cmTile.root.view;
  const position = view.state.doc.toString().indexOf(text);
  if (position < 0) return false;
  view.focus();
  view.dispatch({ selection: { anchor: position }, effects: view.constructor.scrollIntoView(position, { y: 'center' }) });
  return true;
}

function scrollToSource(content: Element, text: string): boolean {
  const view = (content as Element & { cmTile: { root: { view: EditorViewLike } } }).cmTile.root.view;
  const position = view.state.doc.toString().indexOf(text);
  if (position < 0) return false;
  view.dispatch({ effects: view.constructor.scrollIntoView(position, { y: 'start', yMargin: 16 }) });
  return true;
}
const { values } = parseArgs({
  options: {
    note: { type: 'string', default: path.join(repoRoot, 'scripts/fixtures/render-preview/Render Preview.md') },
    modes: { type: 'string', default: 'light,dark' },
    out: { type: 'string', default: path.join(repoRoot, '.local/render-preview') },
    name: { type: 'string' },
    'scroll-to': { type: 'string' },
    click: { type: 'string' },
    find: { type: 'string' },
    eval: { type: 'string' },
    window: { type: 'boolean', default: false },
    translucency: { type: 'string' },
    width: { type: 'string', default: '1280' },
    height: { type: 'string', default: '1400' },
  },
});

const translucencyLevels = ['off', 'subtle', 'medium', 'clear'];
const translucency = values.translucency ?? (values.window ? 'medium' : undefined);
if (translucency !== undefined && !translucencyLevels.includes(translucency)) {
  throw new Error(`--translucency must be one of ${translucencyLevels.join(', ')}.`);
}
if (values.window && process.platform !== 'darwin') throw new Error('--window needs macOS (it uses screencapture).');

const notePath = path.resolve(values.note);
const note = await readFile(notePath, 'utf8');
const title = path.basename(notePath, '.md');
const name = values.name ?? title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
await mkdir(values.out, { recursive: true });
await buildTargets();

const server = await createServer({ root: repoRoot, logLevel: 'error', server: { host: 'localhost', port: 0, strictPort: false } });
await server.listen();
const address = server.httpServer?.address();
if (!address || typeof address === 'string') throw new Error('No dev server address.');

try {
  for (const mode of values.modes.split(',')) {
    const home = await mkdtemp(path.join(tmpdir(), 'hackdesk-render-preview-'));
    const vault = path.join(home, 'vault');
    await mkdir(path.join(home, '.hackdesk'));
    await mkdir(vault);
    await writeFile(path.join(vault, `${title}.md`), note);
    for (const file of await readdir(path.dirname(notePath))) {
      if (/\.(?:svg|png|jpe?g|gif|webp)$/i.test(file)) await copyFile(path.join(path.dirname(notePath), file), path.join(vault, file));
    }
    await writeFile(path.join(home, '.hackdesk', 'settings.json'), JSON.stringify({
      appearance: { theme: mode, presetId: 'hackmd-neo', customSeed: {} },
      localVault: { vaults: [{ id: 'render-preview', path: vault }], activeVaultId: 'render-preview' },
      onboarding: { hackmdTokenSetupDeferred: true },
    }));

    const env: Record<string, string> = {};
    for (const [key, value] of Object.entries(process.env)) if (value !== undefined) env[key] = value;
    delete env.ELECTRON_RUN_AS_NODE;
    env.HOME = home;
    // A background window is invisible, so the window server has nothing to capture.
    if (!values.window) env.HACKDESK_E2E_BACKGROUND = '1';
    // Vite listens on localhost, which may resolve to ::1 only; 127.0.0.1 would never connect.
    env.HACKDESK_ELECTRON_DEV_SERVER_URL = `http://localhost:${address.port}`;

    const app = await electron.launch({
      args: [repoRoot, `--hackdesk-home=${home}`, `--user-data-dir=${path.join(home, 'user-data')}`],
      cwd: repoRoot,
      env,
    });
    try {
      const page = await app.firstWindow();
      page.on('console', (message) => {
        if (message.type() === 'error') console.error(`[renderer] ${message.text()}`);
      });
      if (values.window) {
        await app.evaluate(({ BrowserWindow }, size) => {
          BrowserWindow.getAllWindows()[0]?.setContentSize(size.width, size.height);
        }, { width: Number(values.width), height: Number(values.height) });
      } else {
        await page.setViewportSize({ width: Number(values.width), height: Number(values.height) });
      }
      if (translucency !== undefined) {
        // Kept per computer in localStorage, read when the app starts (sidebar-translucency-preference.ts).
        await page.evaluate((level) => window.localStorage.setItem('hackdesk_sidebar_translucency', level), translucency);
        await page.reload();
      }

      // The saved search state can arrive after launch and replace what was typed; retry until the note opens.
      const search = page.getByPlaceholder('Search notes');
      const deadline = Date.now() + 30_000;
      for (;;) {
        try {
          await search.fill(title);
          await page.getByRole('list', { name: 'Search results' }).getByRole('button', { name: title, exact: true }).click({ timeout: 2000 });
          break;
        } catch (error) {
          if (Date.now() > deadline) {
            await page.screenshot({ path: path.join(values.out, `${name}-${mode}-failed.png`) });
            throw error;
          }
        }
      }
      await search.fill('');
      const content = page.locator('.cm-content').first();
      await content.waitFor();
      // Lazy widgets (KaTeX, Mermaid, language parsers, images) settle after the first paint.
      await page.waitForTimeout(2000);

      // Both options search the markdown source, so they also reach lines a widget stands in for.
      if (values.click) {
        const found = await content.evaluate(placeCursorAt, values.click);
        if (!found) throw new Error(`--click: "${values.click}" is not in the note.`);
        await page.waitForTimeout(300);
      }
      if (values['scroll-to']) {
        const found = await content.evaluate(scrollToSource, values['scroll-to']);
        if (!found) throw new Error(`--scroll-to: "${values['scroll-to']}" is not in the note.`);
        await page.waitForTimeout(500);
      }
      if (values.find !== undefined) {
        await content.click();
        await page.keyboard.press(process.platform === 'darwin' ? 'Meta+f' : 'Control+f');
        await page.keyboard.type(values.find);
        await page.waitForTimeout(300);
      }
      if (values.eval) console.log(`[${mode}]`, await page.evaluate(values.eval));

      const file = path.join(values.out, `${name}-${mode}${values.window ? `-window-${translucency}` : ''}.png`);
      if (values.window) {
        // Capture the window's area of the screen, with the window in front so nothing covers it.
        const bounds = await app.evaluate(async ({ app: electronApp, BrowserWindow }) => {
          const window = BrowserWindow.getAllWindows()[0];
          if (!window) return null;
          electronApp.focus({ steal: true });
          window.moveTop();
          window.focus();
          await new Promise((resolve) => setTimeout(resolve, 500));
          return window.getBounds();
        });
        if (!bounds) throw new Error('--window: the app has no window.');
        const rect = [bounds.x, bounds.y, bounds.width, bounds.height].join(',');
        try {
          await promisify(execFile)('screencapture', ['-x', `-R${rect}`, file]);
        } catch (error) {
          throw new Error('--window: screencapture failed. The screen must be awake and unlocked, and the terminal needs '
            + 'Screen Recording permission (System Settings > Privacy & Security).', { cause: error });
        }
      } else {
        await page.locator('.cm-editor').first().screenshot({ path: file });
      }
      console.log(file);
    } finally {
      await app.close().catch(() => app.process().kill('SIGKILL'));
      await rm(home, { recursive: true, force: true }).catch(() => undefined);
    }
  }
} finally {
  await server.close();
}
