import { _electron as electron, expect, test, type ElectronApplication, type Locator, type Page } from '@playwright/test';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { definedEnvironment } from './fixtures/environment';

import { ELECTRON_CHANNELS } from '../src/shared/channels';
import { defaultSettings, type EditorMode } from '../../src/lib/settings';
import { HACKDESK_THEME_PRESETS, resolveHackDeskTheme } from '../../src/lib/themes';

const repoRoot = resolve(import.meta.dirname, '../..');
const primary = process.platform === 'darwin' ? 'Meta' : 'Control';
const teamNames = ['A very long workspace name for layout checks', 'Second Team'];

async function launchFixture(editorMode: EditorMode = 'helix', navigationFixtures = false, recordKeyboard = false, theme: 'dark' | 'light' = 'dark') {
  const testHome = await mkdtemp(join(tmpdir(), 'hackdesk-ui-'));
  const vault = join(testHome, 'vault');
  await mkdir(join(testHome, '.hackdesk'), { recursive: true });
  await mkdir(vault);
  await writeFile(join(vault, 'UI fixture.md'), '# UI fixture\n\nTest note for layout checks.\n');
  if (navigationFixtures) {
    for (const folder of ['Projects/Sub', 'Folders only/Last']) await mkdir(join(vault, folder), { recursive: true });
    for (const name of ['Alpha', 'Beta', 'Gamma', ...Array.from({ length: 8 }, (_, i) => `Long document title number ${i}`), 'Projects/Sub/One', 'Projects/Sub/Two', 'Projects/Direct', 'Folders only/Last/Deep']) {
      await writeFile(join(vault, `${name}.md`), `# ${name.split('/').at(-1)}\n\nFixture content.\n`);
    }
  }
  const settings = {
    ...defaultSettings,
    appearance: { ...defaultSettings.appearance, theme },
    localVault: { path: vault },
    editor: { mode: editorMode },
  };
  await writeFile(join(testHome, '.hackdesk', 'settings.json'), JSON.stringify(settings));
  const env = { ...definedEnvironment(process.env) };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.HACKDESK_ELECTRON_DEV_SERVER_URL;
  const app = await electron.launch({
    args: [repoRoot, `--user-data-dir=${join(testHome, 'user-data')}`, `--hackdesk-home=${testHome}`],
    cwd: repoRoot,
    env,
    // Local review recordings use the installed Playwright FFmpeg runtime.
    // CI keeps these behavior checks independent of browser/video downloads.
    recordVideo: recordKeyboard && !process.env.CI ? { dir: test.info().outputPath('recordings'), size: { width: 1440, height: 900 } } : undefined,
  });
  const page = await app.firstWindow();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  // Use real local-vault IPC and fixed remote fixtures, without credentials or
  // network access. No test-only hooks are added to the production renderer.
  await app.evaluate(({ ipcMain }, { channels, storedSettings, names }) => {
    let safeSettings = {
      ...storedSettings,
      hasHackmdApiToken: true,
      hasAppearanceSettings: true,
      hasLocalVault: true,
      shouldShowHackmdOnboarding: false,
      hackmdCliConfig: { hasAccessToken: false, hasCustomEndpoint: false },
    };
    const replace = (channel: string, handler: Parameters<typeof ipcMain.handle>[1]) => {
      ipcMain.removeHandler(channel);
      ipcMain.handle(channel, handler);
    };
    replace(channels.settingsGet, () => safeSettings);
    replace(channels.settingsUpdate, (_event, update) => {
      safeSettings = { ...safeSettings, ...update };
      return safeSettings;
    });
    replace(channels.hackmdGetCurrentUser, () => ({ source: 'remote', data: {
      id: 'fixture-user', name: 'Fixture User', username: 'fixture', email: 'fixture@example.com', photo: null, teams: [], upgraded: false,
    } }));
    replace(channels.hackmdListTeams, () => ({ source: 'remote', data: names.map((name, index) => ({
      id: `fixture-team-${index}`, name, path: `fixture-team-${index}`, ownerId: null,
      visibility: 'private', logo: null, description: null, createdAtMillis: null, upgraded: false,
    })) }));
    const remoteNote = {
      id: 'remote-ui', shortId: 'remote-ui', title: 'Remote UI fixture', content: '# Remote UI fixture\n\nTest note for layout checks.',
      tags: ['playground'], description: 'Fixture description', permalink: null, publishLink: 'https://hackmd.io/remote-ui',
      folderPaths: [], teamPath: null, readPermission: 'owner', writePermission: 'owner',
      createdAtMillis: null, updatedAtMillis: null, lastChangeUser: null, publishedAtMillis: null, publishType: 'edit',
      tagsUpdatedAtMillis: null, titleUpdatedAtMillis: null, userPath: null,
    };
    replace(channels.hackmdListNotes, () => ({ source: 'remote', data: [remoteNote] }));
    replace(channels.hackmdGetNote, () => ({ source: 'remote', data: remoteNote }));
    for (const channel of [channels.hackmdListTeamNotes, channels.hackmdListFolders, channels.hackmdListTeamFolders, channels.hackmdListHistory]) {
      replace(channel, () => ({ source: 'remote', data: [] }));
    }
    for (const channel of [channels.hackmdGetFolderOrder, channels.hackmdGetTeamFolderOrder]) {
      replace(channel, () => ({ source: 'remote', data: {} }));
    }
  }, { channels: ELECTRON_CHANNELS, storedSettings: settings, names: teamNames });
  await page.reload();
  await expect(page.getByTestId('sidebar-footer').getByRole('button', { name: /^Account: Fixture User/ })).toBeVisible();
  await expect(page.getByRole('treeitem', { name: 'UI fixture', exact: true })).toBeVisible();
  return { app, page, vault };
}

async function dismissBlockingConfirm(page: Page) {
  const dialog = page.getByRole('alertdialog');
  for (let attempt = 0; attempt < 3; attempt++) {
    if (!(await dialog.isVisible().catch(() => false))) return;
    const action = dialog.getByRole('button', { name: /^(Close|Close Tab|Close HackDesk)$/ }).first();
    if (await action.count()) await action.click();
    else await page.keyboard.press('Escape');
  }
}

async function stopApp(app: ElectronApplication, recordKeyboard = false) {
  if (recordKeyboard) {
    await dismissBlockingConfirm(await app.firstWindow());
    await app.close();
    return;
  }
  if (app.process().exitCode !== null) return;
  const exited = new Promise<void>((done) => app.process().once('exit', () => done()));
  app.process().kill('SIGKILL');
  await exited;
}

// Describes the focused element if its outer focus ring is cut off by a clipping ancestor.
async function clippedFocusRing(page: Page) {
  return page.evaluate(() => {
    if (document.documentElement.dataset.inputModality !== 'keyboard') return null;
    const element = document.activeElement as HTMLElement | null;
    if (!element || element === document.body) return null;
    const shadow = getComputedStyle(element).boxShadow;
    if (!shadow || shadow === 'none' || shadow.includes('inset')) return null;
    const rect = element.getBoundingClientRect();
    const ring = 2;
    for (let parent = element.parentElement; parent; parent = parent.parentElement) {
      const style = getComputedStyle(parent);
      const clipsX = ['hidden', 'auto', 'scroll', 'clip'].includes(style.overflowX);
      const clipsY = ['hidden', 'auto', 'scroll', 'clip'].includes(style.overflowY);
      if (!clipsX && !clipsY) continue;
      const bounds = parent.getBoundingClientRect();
      if ((clipsX && (rect.left - ring < bounds.left - 0.5 || rect.right + ring > bounds.right + 0.5))
        || (clipsY && (rect.top - ring < bounds.top - 0.5 || rect.bottom + ring > bounds.bottom + 0.5))) {
        const name = element.getAttribute('aria-label') || element.id || element.getAttribute('placeholder') || element.getAttribute('name') || element.textContent?.trim().slice(0, 40) || '';
        return `${element.tagName.toLowerCase()}[${element.getAttribute('role') ?? ''}] "${name}"`;
      }
    }
    return null;
  });
}

async function clippedFocusRingsWhileTabbing(page: Page, steps: number) {
  const clipped = new Set<string>();
  for (let step = 0; step < steps; step++) {
    await page.keyboard.press('Tab');
    const found = await clippedFocusRing(page);
    if (found) clipped.add(found);
  }
  return [...clipped];
}

async function openWorkspaceSwitcher(page: Page) {
  const list = page.getByRole('dialog', { name: 'Workspaces' });
  if (!(await list.isVisible())) await page.getByRole('button', { name: /^Switch workspace, current: / }).click();
  await expect(list).toBeVisible();
  await list.evaluate(element => Promise.all(element.getAnimations().map(animation => animation.finished)));
  return list;
}

async function switchWorkspace(page: Page, name: string) {
  await (await openWorkspaceSwitcher(page)).getByRole('button', { name, exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Workspaces' })).toBeHidden();
}

// Hints show after the primary key has been held for a moment (HINT_DELAY_MS in KeyboardNavigation).
async function holdPrimary(page: Page) {
  await page.keyboard.down(primary);
  await page.waitForTimeout(500);
}

// Hints cancel while the page is still changing, so hold the key again until they stay.
async function holdForHints(page: Page, target: Locator, ready = () => page.locator('[data-keyboard-navigation-overlay]').isVisible()) {
  await expect.poll(async () => {
    await page.keyboard.up(primary);
    await target.focus();
    await holdPrimary(page);
    return ready();
  }).toBe(true);
}

async function openFixtureNote(page: Page) {
  await switchWorkspace(page, 'Local Vault');
  await page.locator('[data-folder-tree-kind="note"]').getByRole('treeitem', { name: 'UI fixture', exact: true }).click();
  await expect(page.locator('.cm-content')).toContainText('Test note for layout checks.');
  // Opening a note also requests editor focus; let that finish before moving focus elsewhere.
  await expect(page.locator('.cm-content')).toBeFocused();
}

async function ensureKeyboardModality(page: Page) {
  await page.keyboard.press('Tab');
}

async function expectInsetFocus(locator: Locator, container = false) {
  await locator.focus();
  await ensureKeyboardModality(locator.page());
  await locator.focus();
  await expect.poll(() => locator.evaluate((element) => getComputedStyle(element).boxShadow)).toContain('inset');
  // Verify that the focused field remains fully inside every clipping ancestor.
  await locator.scrollIntoViewIfNeeded();
  await expect.poll(() => locator.evaluate((element) => {
    const field = element.getBoundingClientRect();
    for (let parent = element.parentElement; parent; parent = parent.parentElement) {
      const style = getComputedStyle(parent);
      if (!['hidden', 'auto', 'scroll', 'clip'].includes(style.overflowX)) continue;
      const bounds = parent.getBoundingClientRect();
      if (field.left < bounds.left || field.right > bounds.right || field.top < bounds.top || field.bottom > bounds.bottom) return false;
    }
    return true;
  }), { message: container ? 'Tag focus ring is inside its clipping ancestors' : 'Field focus ring is inside its clipping ancestors' }).toBe(true);
}

test('inline preview follows scrolling and reveals source without losing edits', async () => {
  const { app, page } = await launchFixture('standard');
  try {
    await openFixtureNote(page);
    const source = ['Before', ...Array.from({ length: 1000 }, (_, index) => `Line ${index}`), '**bottom** and [link](https://example.com)'].join('\n');
    const content = page.locator('.cm-content');
    await content.focus();
    await page.keyboard.press(`${primary}+a`);
    await page.keyboard.insertText(source);
    const lastLine = content.locator('.cm-line').filter({ hasText: 'bottom' });
    await expect(lastLine).toHaveText('**bottom** and [link](https://example.com)');
    await page.keyboard.press(`${primary}+Home`);
    // The editor renders only visible lines and measures them as they appear, so the bottom can move
    // after the first jump; keep scrolling until the last line is drawn.
    await expect(async () => {
      await page.locator('.cm-scroller').evaluate((element) => { element.scrollTop = element.scrollHeight; });
      await expect(lastLine).toHaveText('bottom and link', { timeout: 500 });
    }).toPass();
    await lastLine.click();
    await expect(lastLine).toHaveText('**bottom** and [link](https://example.com)');
    await page.keyboard.press(`${primary}+End`);
    await page.keyboard.type(' edited');
    await expect(lastLine).toHaveText('**bottom** and [link](https://example.com) edited');
    await page.keyboard.press(`${primary}+z`);
    await expect(lastLine).toHaveText('**bottom** and [link](https://example.com)');
  } finally {
    await stopApp(app);
  }
});

test('palette enabled state and contrast survive real CSS in all built-in themes', async () => {
  const testInfo = test.info();
  const { app, page } = await launchFixture();
  try {
    await page.keyboard.press(`${primary}+k`);
    const input = page.getByRole('combobox', { name: 'Search notes, folders, and commands' });
    await input.fill('workspace');
    const workspaceOption = page.getByRole('option', { name: /^My Workspace\b/ });
    await expect(workspaceOption).toHaveAttribute('data-disabled', 'false');
    await expect(workspaceOption).toHaveCSS('opacity', '1');
    await expect(workspaceOption).not.toHaveCSS('pointer-events', 'none');
    await page.mouse.move(0, 0);
    await workspaceOption.hover();
    await expect(workspaceOption).toHaveAttribute('aria-selected', 'true');
    await page.mouse.move(0, 0);

    for (const preset of HACKDESK_THEME_PRESETS) {
      for (const mode of ['light', 'dark'] as const) {
        await page.evaluate((theme) => {
          for (const [name, value] of Object.entries(theme)) document.documentElement.style.setProperty(name, value);
        }, resolveHackDeskTheme({ presetId: preset.id, mode }));
        await input.press('Home');
        await expect(workspaceOption).toHaveAttribute('aria-selected', 'true');
        const ratios = () => workspaceOption.evaluate((item) => {
          const channels = (color: string) => color.match(/[\d.]+/g)!.map(Number);
          const luminance = (values: number[]) => values.slice(0, 3).reduce((sum, value, index) => {
            const c = value / 255;
            return sum + (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4) * [0.2126, 0.7152, 0.0722][index];
          }, 0);
          const contrast = (color: string, background: number[]) => {
            const a = luminance(channels(color));
            const b = luminance(background);
            return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
          };
          const base = channels(getComputedStyle(item.closest('[cmdk-root]')!).backgroundColor);
          const selected = channels(getComputedStyle(item).backgroundColor);
          const opacity = selected[3] ?? 1;
          const painted = selected.slice(0, 3).map((c, i) => c * opacity + base[i] * (1 - opacity));
          return Array.from(item.querySelectorAll('span.block')).map((text) => contrast(getComputedStyle(text).color, painted));
        });
        expect((await ratios()).length).toBeGreaterThan(0);
        await expect.poll(async () => Math.min(...await ratios()), { message: `${preset.id} ${mode}` }).toBeGreaterThanOrEqual(4.5);
      }
    }
    await page.evaluate((theme) => {
      for (const [name, value] of Object.entries(theme)) document.documentElement.style.setProperty(name, value);
    }, resolveHackDeskTheme({ presetId: 'hackmd-neo', mode: 'dark' }));
    await page.screenshot({ animations: 'disabled', path: testInfo.outputPath('01-palette.png') });
    await workspaceOption.click();
    await expect(page.getByRole('dialog', { name: 'Command Palette' })).not.toBeVisible();
    await page.keyboard.press(`${primary}+k`);
    await page.getByRole('combobox').fill('New Tab');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog', { name: 'Command Palette' })).not.toBeVisible();
    await page.keyboard.press(`${primary}+k`);
    await page.getByRole('combobox').fill('Use Dark Theme');
    const disabled = page.getByRole('option', { name: /^Use Dark Theme\b/ });
    await expect(disabled).toHaveAttribute('aria-disabled', 'true');
    await expect(disabled).toHaveCSS('pointer-events', 'none');
    await page.getByRole('combobox').press('Home');
    await expect(disabled).toHaveAttribute('aria-selected', 'false');
    await expect(page.getByRole('option', { name: /^Show Finder Results/ })).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog', { name: 'Command Palette' })).not.toBeVisible();
    await expect(page.getByPlaceholder('Search notes', { exact: true })).toHaveValue('Use Dark Theme');
  } finally {
    await stopApp(app);
  }
});

test('focus rings stay visible instead of being cut off by their containers', async () => {
  const { app, page } = await launchFixture('standard', true);
  try {
    await page.setViewportSize({ width: 1280, height: 760 });
    await openFixtureNote(page);
    await ensureKeyboardModality(page);
    await page.getByRole('treeitem', { name: 'UI fixture', exact: true }).focus();
    const clipped = await clippedFocusRingsWhileTabbing(page, 60);
    const list = await openWorkspaceSwitcher(page);
    for (const row of await list.locator('[data-workspace-row]').all()) {
      await row.focus();
      const found = await clippedFocusRing(page);
      if (found) clipped.push(`switcher ${found}`);
    }
    await page.keyboard.press('Escape');
    await page.keyboard.press(`${primary}+,`);
    await page.getByRole('dialog', { name: 'Settings', exact: true }).getByRole('combobox', { name: 'Search settings' }).fill('a');
    clipped.push(...(await clippedFocusRingsWhileTabbing(page, 40)).map(found => `settings ${found}`));
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await page.keyboard.press(`${primary}+k`);
    clipped.push(...(await clippedFocusRingsWhileTabbing(page, 10)).map(found => `palette ${found}`));
    // Tabbing may leave focus on a palette control, where the first Escape only clears it.
    await expect(async () => {
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog', { name: 'Command Palette' })).toBeHidden({ timeout: 500 });
    }).toPass();
    // Note Details, opened from the leader menu.
    await page.locator('.cm-content').focus();
    await page.keyboard.press(`${primary}+j`);
    await expect(page.getByRole('menu', { name: 'Commands' })).toBeVisible();
    await page.keyboard.press('v');
    await page.keyboard.press('d');
    const details = page.locator('[data-hackdesk-focus="inspector"]');
    await expect(details).toBeVisible();
    await details.locator('input, textarea, button').first().focus();
    clipped.push(...(await clippedFocusRingsWhileTabbing(page, 30)).map(found => `details ${found}`));
    expect(clipped).toEqual([]);
  } finally {
    await stopApp(app);
  }
});

test('a keyboard-only tour of the main flows in light theme at a narrow window, with consistent motion', async () => {
  const { app, page } = await launchFixture('standard', true, false, 'light');
  try {
    await page.setViewportSize({ width: 900, height: 700 });
    const shot = (name: string) => page.screenshot({ animations: 'disabled', path: test.info().outputPath(`28-tour-${name}.png`) });
    const leader = async (keys: string) => {
      await page.keyboard.press(`${primary}+j`);
      await expect(page.getByRole('menu', { name: 'Commands' })).toBeVisible();
      for (const key of keys) await page.keyboard.press(key);
    };
    const trigger = page.getByRole('button', { name: /^Switch workspace, current: / });

    // Switch workspaces from the switcher, then return to the Local Vault.
    await page.keyboard.press(`${primary}+1`);
    await expect(trigger).toHaveAccessibleName('Switch workspace, current: My Workspace');
    await leader('gw');
    const switcher = page.getByRole('dialog', { name: 'Workspaces' });
    await expect(switcher.getByRole('button', { name: 'My Workspace', exact: true })).toBeFocused();
    // Places sit together at the top: My Workspace, History, Local Vault.
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await expect(switcher.getByRole('button', { name: 'Local Vault', exact: true })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(trigger).toHaveAccessibleName('Switch workspace, current: Local Vault');

    // Search, move through results, open one.
    await page.keyboard.press('/');
    const search = page.getByRole('textbox', { name: 'Search notes' });
    await expect(search).toBeFocused();
    await page.keyboard.type('Alpha');
    await expect(page.getByRole('status').filter({ hasText: 'Alpha, 1 of 1' })).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('tab', { name: /^Alpha(?:, .+)?$/ })).toHaveAttribute('aria-selected', 'true');
    await shot('search');

    // View options holds scope, sort and filters.
    await leader('gv');
    await expect(page.getByRole('menu').getByText('Search In')).toBeVisible();
    await shot('view-options');
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');

    // The header is one line: where the note lives, and its buttons.
    await page.locator('.cm-content').click();
    await expect(page.getByRole('navigation', { name: 'Note location' })).toHaveText(/^Local Vault\s*\/\s*Alpha$/);
    await expect(page.getByRole('textbox', { name: 'Note title' })).toHaveCount(0);

    // Rename from the leader menu.
    await leader('nr');
    const rename = page.getByRole('dialog', { name: 'Rename Note' });
    await expect(rename.getByLabel('Title')).toBeFocused();
    await shot('rename');
    await page.keyboard.press(`${primary}+a`);
    await page.keyboard.type('Alpha renamed');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('tab', { name: /^Alpha renamed(?:, .+)?$/ })).toBeVisible();

    // Note Details slides in and out over the note, taking focus and returning it.
    await leader('vd');
    const details = page.locator('[data-active-pane="true"] [data-state]').filter({ has: page.getByRole('complementary', { name: 'Note details' }) });
    await expect(details).toHaveAttribute('data-state', 'open');
    expect(await details.evaluate(element => getComputedStyle(element).transitionDuration)).toBe('0.2s');
    await expect.poll(() => page.evaluate(() => Boolean(document.activeElement?.closest('[data-hackdesk-focus="inspector"]')))).toBe(true);
    await shot('details');
    await page.keyboard.press('Escape');
    await expect(details).toHaveAttribute('data-state', 'closed');
    await expect.poll(() => details.evaluate(element => getComputedStyle(element).opacity)).toBe('0');
    await expect(page.locator('[data-active-pane="true"] .cm-content')).toBeFocused();

    // The sidebar animates its width with the same panel motion.
    const sidebar = page.locator('#note-navigator-panel');
    expect(await sidebar.evaluate(element => getComputedStyle(element).transitionDuration)).toBe('0.2s');
    await page.keyboard.press(`${primary}+b`);
    await expect.poll(async () => (await sidebar.boundingBox())!.width).toBe(0);
    await page.keyboard.press(`${primary}+b`);
    await expect.poll(async () => (await sidebar.boundingBox())!.width).toBeGreaterThan(200);

    // Split, then Hack Mode in and out.
    await page.locator('[data-active-pane="true"] .cm-content').click();
    await page.keyboard.press(`${primary}+\\`);
    await expect(page.locator('section[data-document-pane-id]')).toHaveCount(2);
    await page.keyboard.press(`${primary}+.`);
    await expect(page.locator('.app-chrome')).toHaveAttribute('data-hack-mode', 'true');
    await shot('hack-mode');
    await page.keyboard.press(`${primary}+.`);
    await expect(page.locator('.app-chrome')).not.toHaveAttribute('data-hack-mode');

    // F6 goes around the regions, even with the Hack Mode toast still showing.
    await expect(page.getByRole('region', { name: 'Notifications' }).getByText(/^Hack Mode/)).toBeVisible();
    // Both panes' editors are regions, so the pane tells them apart.
    const focusedZone = () => page.evaluate(() => {
      const zone = document.activeElement?.closest<HTMLElement>('[data-hackdesk-focus]')?.dataset.hackdeskFocus ?? '';
      const pane = document.activeElement?.closest<HTMLElement>('[data-document-pane-id]')?.dataset.documentPaneId;
      return zone === 'editor' && pane ? `editor ${pane}` : zone;
    });
    const visited: string[] = [await focusedZone()];
    for (let step = 0; step < 5; step++) {
      await page.keyboard.press('F6');
      // Focus moves after a frame; wait for it before pressing again.
      await expect.poll(focusedZone).not.toBe(visited.at(-1));
      visited.push(await focusedZone());
    }
    // Around once: the sidebar, the tabs, both editors and back to where it started.
    const [start, ...rest] = visited;
    expect(rest).toEqual(['navigator', 'tabs', 'editor note-pane-primary', start, 'navigator']);

    // A folder in the note's location opens it in the sidebar and moves focus there. Open a note
    // in a folder first, rather than relying on which note the fixture opened.
    await page.getByRole('textbox', { name: 'Search notes' }).focus();
    await page.keyboard.type('Deep');
    await expect(page.getByRole('status').filter({ hasText: 'Deep, 1 of 1' })).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('tab', { name: /^Deep(?:, .+)?$/ })).toHaveAttribute('aria-selected', 'true');
    // A non-default sort also lists results instead of the tree; the location still reveals the folder.
    await page.getByRole('button', { name: 'View options' }).click();
    await page.getByRole('menu').getByText('Title A-Z', { exact: true }).click();
    await page.keyboard.press('Escape');
    const deepLocation = page.locator('[data-active-pane="true"]').getByRole('navigation', { name: 'Note location' });
    await expect(deepLocation).toHaveText(/Folders only\s*\/\s*Last\s*\/\s*Deep$/);
    await deepLocation.getByRole('button', { name: 'Last', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect.poll(() => page.evaluate(() => {
      const item = document.activeElement?.closest('[data-folder-tree-folder-id]');
      return document.activeElement?.getAttribute('role') === 'treeitem' ? item?.textContent?.trim() ?? '' : '';
    })).toMatch(/^Last/);
    await shot('done');
  } finally {
    await app.evaluate(({ ipcMain }, channel) => {
      ipcMain.removeHandler(channel);
      ipcMain.handle(channel, () => ({ confirmed: true }));
    }, ELECTRON_CHANNELS.appConfirm);
    await stopApp(app);
  }
});

test('workspace switcher rows, gap boundaries and full-height Settings workbench', async () => {
  const testInfo = test.info();
  const { app, page } = await launchFixture();
  try {
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1440, 900));
    const list = await openWorkspaceSwitcher(page);
    const workspace = list.getByRole('button', { name: `${teamNames[0]}, private`, exact: true });
    const drag = list.getByRole('button', { name: `Reorder ${teamNames[0]}`, exact: true });
    const pin = list.getByRole('button', { name: `Unpin ${teamNames[0]}`, exact: true });
    await expect(list.getByRole('button', { name: 'Local Vault', exact: true })).toBeFocused();
    await page.mouse.move(900, 600);
    const rowBounds = (await workspace.locator('..').boundingBox())!;
    expect(Math.abs((await workspace.boundingBox())!.width - rowBounds.width)).toBeLessThan(1);
    await expect(drag).toHaveCSS('opacity', '0');
    await expect(pin).toHaveCount(0);
    await expect(workspace).toContainText(process.platform === 'darwin' ? '⌘2' : 'Ctrl+2');
    await page.screenshot({ animations: 'disabled', path: testInfo.outputPath('10-switcher-idle.png') });
    await workspace.hover();
    await expect(drag).toHaveCSS('opacity', '1');
    await expect(pin).toBeVisible();
    await page.screenshot({ animations: 'disabled', path: testInfo.outputPath('02-switcher-controls.png') });
    await page.keyboard.press('Escape');
    await expect(list).toBeHidden();
    await expect(page.getByRole('button', { name: /^Switch workspace, current: / })).toBeFocused();

    // Reorder has its own fixture: dnd-kit briefly suppresses clicks after a drop.
    await openFixtureNote(page);
    const sash = page.getByRole('button', { name: /^Resize sidebar.*Current width/ });
    await expect(sash).toHaveCount(1);
    // The sidebar's handle is the editor's border, with no gap of its own, so the sidebar sits as
    // far from the editor as from the window's edge. It is grabbed on that border.
    expect((await sash.boundingBox())!.width).toBe(0);
    const sidebar = page.locator('#note-navigator-panel');
    const sashBounds = (await sash.boundingBox())!;
    const initialWidth = (await sidebar.boundingBox())!.width;
    await page.mouse.move(sashBounds.x + 1, sashBounds.y + 100);
    await page.mouse.down();
    await page.mouse.move(sashBounds.x + 30, sashBounds.y + 100);
    await page.mouse.up();
    await expect.poll(async () => (await sidebar.boundingBox())!.width).toBeGreaterThan(initialWidth);
    await page.screenshot({ animations: 'disabled', path: testInfo.outputPath('03-panel-boundaries.png') });
    await page.keyboard.press(`${primary}+\\`);
    const separator = page.getByRole('separator', { name: /Resize document panes/ });
    await expect(separator).toBeVisible();
    expect((await separator.boundingBox())!.width).toBe(6);
    await separator.focus();
    await page.keyboard.press('ArrowLeft');
    await page.screenshot({ animations: 'disabled', path: testInfo.outputPath('04-document-panes.png') });

    await page.keyboard.press(`${primary}+,`);
    for (const height of [900, 660]) {
      await page.setViewportSize({ width: 1440, height });
      await expect(page.getByRole('dialog', { name: 'Settings' })).toHaveCSS('height', `${Math.min(640, height - 64)}px`);
      const settingsSidebar = page.getByRole('complementary', { name: 'Settings sidebar' });
      const assertFullHeight = async () => {
        await expect.poll(() => settingsSidebar.evaluate((element) => {
          const own = element.getBoundingClientRect();
          const parent = element.parentElement!.getBoundingClientRect();
          return Math.abs(own.bottom - parent.bottom) + Math.abs(own.top - parent.top);
        })).toBeLessThan(1);
      };
      await page.getByRole('tab', { name: 'Shortcuts', exact: true }).click();
      await assertFullHeight();
      const dialogHeight = (await page.getByRole('dialog', { name: 'Settings' }).boundingBox())!.height;
      await page.getByRole('tab', { name: 'General', exact: true }).click();
      await assertFullHeight();
      expect((await page.getByRole('dialog', { name: 'Settings' }).boundingBox())!.height).toBe(dialogHeight);
    }
    await page.getByRole('tab', { name: 'Shortcuts', exact: true }).click();
    await page.screenshot({ animations: 'disabled', path: testInfo.outputPath('05-settings.png') });
  } finally {
    await stopApp(app);
  }
});

test('workspace keyboard reorder keeps focus and completes the drop', async () => {
  const { app, page } = await launchFixture();
  try {
    const drag = page.getByRole('button', { name: `Reorder ${teamNames[0]}`, exact: true });
    const teamList = (await openWorkspaceSwitcher(page)).getByTestId('workspace-switcher-team-list');
    await drag.focus();
    // KeyboardSensor attaches its listener in the next task; keyup models a real press.
    await drag.press('Space', { delay: 50 });
    await expect(drag).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('ArrowDown', { delay: 50 });
    await expect.poll(() => drag.locator('xpath=ancestor::li').evaluate(element => element.style.transform)).toMatch(/translate3d\(0px, (?!0px)[\d.]+px/);
    await expect(drag).toBeFocused();
    await page.keyboard.press('Space');
    await expect(drag).not.toHaveAttribute('aria-pressed', 'true');
    await expect(teamList.getByRole('listitem').first()).toContainText('Second Team');
    await expect(drag).toBeFocused();
  } finally {
    await stopApp(app);
  }
});

test('the sidebar scrollbar remains clickable beside the resize handle', async () => {
  const { app, page } = await launchFixture('standard', true);
  try {
    await switchWorkspace(page, 'Local Vault');
    await page.setViewportSize({ width: 1100, height: 420 });
    await page.evaluate(() => { document.documentElement.dataset.scrollbars = 'classic'; });
    const scroller = page.locator('#note-navigator-panel .scroll-edges-source').first();
    await expect.poll(() => scroller.evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true);
    const bounds = (await scroller.boundingBox())!;
    const point = { x: bounds.x + bounds.width - 4, y: bounds.y + bounds.height - 12 };
    expect(await page.evaluate(({ x, y }) => Boolean(document.elementFromPoint(x, y)?.closest('.edge-sash')), point)).toBe(false);
    await page.mouse.click(point.x, point.y);
    await expect.poll(() => scroller.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
  } finally {
    await stopApp(app);
  }
});

test('workspace pointer reorder starts on a stable handle and completes the drop', async () => {
  const { app, page } = await launchFixture();
  try {
    const teamList = (await openWorkspaceSwitcher(page)).getByTestId('workspace-switcher-team-list');
    const drag = page.getByRole('button', { name: `Reorder ${teamNames[0]}`, exact: true });
    const target = page.getByRole('button', { name: 'Second Team, private', exact: true });
    await drag.focus();
    await expect(drag).toBeVisible();
    // Locator hover waits for a stable target before mouse coordinates are sampled.
    await drag.hover();
    const start = (await drag.boundingBox())!;
    const end = (await target.boundingBox())!;
    await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
    await page.mouse.down();
    await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2 + 8);
    await expect(drag).toHaveAttribute('aria-pressed', 'true');
    await page.mouse.move(start.x + start.width / 2, end.y + end.height / 2, { steps: 10 });
    await page.mouse.up();
    await expect(drag).not.toHaveAttribute('aria-pressed', 'true');
    await expect(teamList.getByRole('listitem').first()).toContainText('Second Team');
  } finally {
    await stopApp(app);
  }
});

test('one sidebar switches workspaces from its title, with Trash and Settings near the bottom', async () => {
  const { app, page } = await launchFixture('standard', true);
  try {
    await page.setViewportSize({ width: 1280, height: 760 });
    const trigger = page.getByRole('button', { name: /^Switch workspace, current: / });
    await expect(trigger).toHaveAccessibleName('Switch workspace, current: Local Vault');
    const footer = page.getByTestId('sidebar-footer');
    // Trash belongs to HackMD workspaces: it isn't offered in a Local Vault.
    await expect(page.getByTestId('sidebar-trash-row')).toHaveCount(0);
    // Holding the key also shows which number opens which workspace, beside the sidebar. Hints and the
    // card cancel while the page still changes, so check them together in one look.
    const peekShortcut = process.platform === 'darwin' ? '⌘2' : 'Ctrl+2';
    await holdForHints(page, trigger, () => page.evaluate(({ name, shortcut }) => {
      const hints = document.querySelectorAll('[data-navigation-hint="workspace:switcher"]').length;
      const card = document.querySelector('[data-workspace-peek]');
      const row = card?.querySelectorAll('li')[1]?.textContent ?? '';
      const sidebar = document.getElementById('note-navigator-panel')!.getBoundingClientRect();
      return hints === 1 && row.includes(name) && row.includes(shortcut) && card!.getBoundingClientRect().left >= sidebar.right;
    }, { name: teamNames[0], shortcut: peekShortcut }));
    const peek = page.locator('[data-workspace-peek]');
    await page.screenshot({ animations: 'disabled', path: test.info().outputPath('24-workspace-peek.png') });
    await page.keyboard.up(primary);
    await expect(peek).toHaveCount(0);
    await switchWorkspace(page, `${teamNames[0]}, private`);
    await expect(trigger).toHaveAccessibleName(`Switch workspace, current: ${teamNames[0]}`);
    await page.keyboard.press(`${primary}+1`);
    await expect(trigger).toHaveAccessibleName('Switch workspace, current: My Workspace');

    // Trash opens in the sidebar, from its row above the account; Escape goes back to the notes.
    await page.getByTestId('sidebar-trash-row').getByRole('button', { name: 'My Trash' }).click();
    await expect(page.getByRole('button', { name: 'Back to notes' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Back to notes' })).toHaveCount(0);
    await footer.getByRole('button', { name: 'Settings', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Settings', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');

    await page.keyboard.press(`${primary}+b`);
    await expect(page.getByRole('button', { name: 'Expand sidebar', exact: true })).toBeVisible();
    // The collapsed sidebar stays mounted so its width animates, but nothing in it can be reached.
    await expect(page.locator('#note-navigator-panel')).toHaveAttribute('inert', '');
    await expect.poll(async () => (await page.locator('#note-navigator-panel').boundingBox())!.width).toBe(0);
    await page.keyboard.press(`${primary}+b`);
    await expect(trigger).toBeVisible();

    // The leader menu opens the switcher from the keyboard; arrows move and Enter switches.
    await page.keyboard.press(`${primary}+j`);
    await page.keyboard.press('g');
    await page.keyboard.press('w');
    const list = page.getByRole('dialog', { name: 'Workspaces' });
    await expect(list.getByRole('button', { name: 'My Workspace', exact: true })).toBeFocused();
    await page.screenshot({ animations: 'disabled', path: test.info().outputPath('23-workspace-switcher.png') });
    await page.keyboard.press('ArrowDown');
    await expect(list.getByRole('button', { name: 'History', exact: true })).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(list.getByRole('button', { name: 'Local Vault', exact: true })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(list).toBeHidden();
    await expect(trigger).toHaveAccessibleName('Switch workspace, current: Local Vault');
    await expect(page.getByRole('treeitem', { name: 'Alpha', exact: true })).toBeVisible();
  } finally {
    await stopApp(app);
  }
});

test('tab drag, keyboard actions, persistence and pane isolation', async () => {
  const { app, page } = await launchFixture('standard', true);
  const testInfo = test.info();
  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    await switchWorkspace(page, 'Local Vault');
    const openNote = async (name: string) => {
      await page.locator('[data-folder-tree-kind="note"]').getByRole('treeitem', { name, exact: true }).click();
      await expect(page.getByRole('tab', { name: new RegExp(`^${name}(?:, .+)?$`) })).toHaveAttribute('aria-selected', 'true');
    };
    const strip = page.getByRole('navigation', { name: 'Open documents' });
    const labels = () => strip.locator('[data-tab-title]').allTextContents();
    const dragTab = async (from: string, to: string, cancel = false) => {
      const source = (await strip.getByRole('tab', { name: new RegExp(`^${from}(?:, .+)?$`) }).boundingBox())!;
      const target = (await strip.getByRole('tab', { name: new RegExp(`^${to}(?:, .+)?$`) }).boundingBox())!;
      await page.mouse.move(source.x + 10, source.y + source.height / 2);
      await page.mouse.down();
      await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 12 });
      if (cancel) await page.keyboard.press('Escape');
      await page.mouse.up();
    };
    // The vault initially opens its first note; close that tab before arranging a known strip.
    await expect(page.locator('[data-folder-tree-kind="note"]').getByRole('treeitem', { name: 'Alpha', exact: true })).toBeVisible();
    await strip.getByRole('button', { name: /^Close / }).first().click();
    for (const name of ['Alpha', 'Beta', 'Gamma']) await openNote(name);
    await expect(page.locator('.cm-content')).toContainText('# Gamma');
    await page.mouse.move(0, 0);
    const closeActiveTab = strip.getByRole('button', { name: 'Close Gamma', exact: true });
    await expect(closeActiveTab).toHaveCSS('opacity', '1');
    const closeBounds = (await closeActiveTab.boundingBox())!;
    expect(Math.min(closeBounds.width, closeBounds.height)).toBeGreaterThanOrEqual(24);
    const closeInactiveTab = strip.getByRole('button', { name: 'Close Alpha', exact: true });
    await expect(closeInactiveTab).toHaveCSS('opacity', '0');
    await strip.getByRole('tab', { name: /^Alpha(?:, .+)?$/ }).hover();
    await expect(closeInactiveTab).toHaveCSS('opacity', '1');
    // The strip scrolls sideways only; the 40px title bar leaves no room for a vertical scrollbar.
    expect(await strip.evaluate(element => element.scrollHeight > element.clientHeight && getComputedStyle(element).overflowY !== 'hidden')).toBe(false);
    // Radius and small text come from the shared scale; text-2xs follows the 14px UI font size.
    const gammaTab = strip.getByRole('tab', { name: /^Gamma(?:, .+)?$/ });
    await expect(gammaTab.locator('xpath=ancestor::li[1]')).toHaveCSS('border-radius', '6px');
    await expect(closeActiveTab).toHaveCSS('border-radius', '4px');
    await expect(page.locator('.text-2xs').first()).toHaveCSS('font-size', '10px');
    await dragTab('Alpha', 'Gamma');
    await expect.poll(labels).toEqual(['Beta', 'Gamma', 'Alpha']);
    await expect(strip.getByRole('tab', { name: /^Gamma(?:, .+)?$/ })).toHaveAttribute('aria-selected', 'true');
    await dragTab('Alpha', 'Beta', true);
    await expect.poll(labels).toEqual(['Beta', 'Gamma', 'Alpha']);
    await expect(strip.getByRole('tab', { name: /^Gamma(?:, .+)?$/ })).toHaveAttribute('aria-selected', 'true');

    // Verify drag persistence before testing keyboard actions independently.
    // dnd-kit briefly suppresses native clicks after a pointer drag ends,
    // including the click generated by an immediate Enter keypress.
    await expect.poll(() => page.evaluate(() => Object.entries(localStorage).some(([key, value]) => key.startsWith('hackdesk_note_workspace:') && JSON.parse(value).panes[0].tabIds.map((id: string) => JSON.parse(value).tabs[id].title).join(',') === 'Beta,Gamma,Alpha'))).toBe(true);
    await page.reload();
    await expect.poll(labels).toEqual(['Beta', 'Gamma', 'Alpha']);
    await expect(page.locator('.cm-content')).toContainText('# Gamma');
    await page.getByRole('button', { name: 'Pane actions' }).press('Enter');
    await page.getByRole('menuitem', { name: 'Move Tab Left', exact: true }).press('Enter');
    await expect.poll(labels).toEqual(['Gamma', 'Beta', 'Alpha']);
    await page.getByRole('button', { name: 'Pane actions' }).click();
    await expect(page.getByRole('menuitem', { name: 'Move Tab Left', exact: true })).toHaveAttribute('aria-disabled', 'true');
    await page.keyboard.press('Escape');
    await expect.poll(() => page.evaluate(() => Object.entries(localStorage).some(([key, value]) => key.startsWith('hackdesk_note_workspace:') && JSON.parse(value).panes[0].tabIds.map((id: string) => JSON.parse(value).tabs[id].title).join(',') === 'Gamma,Beta,Alpha'))).toBe(true);
    await page.reload();
    await expect.poll(labels).toEqual(['Gamma', 'Beta', 'Alpha']);
    await expect(strip.getByRole('tab', { name: /^Gamma(?:, .+)?$/ })).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press(`${primary}+\\`);
    await expect(page.getByRole('separator', { name: /Resize document panes/ })).toBeVisible();
    await openNote('UI fixture');
    const firstPaneNote = () => page.locator('section[data-document-pane-id]').first().locator('.cm-content').innerText();
    const firstPaneText = await firstPaneNote();
    await dragTab('UI fixture', 'Gamma');
    await expect.poll(labels).toEqual(['UI fixture', 'Gamma']);
    expect(await firstPaneNote()).toBe(firstPaneText);
    await page.screenshot({ animations: 'disabled', path: testInfo.outputPath('08-tab-reorder.png') });
    await strip.getByRole('button', { name: 'Close Gamma', exact: true }).click();
    await expect.poll(labels).toEqual(['UI fixture']);
    await expect(strip.getByRole('tab', { name: /^UI fixture(?:, .+)?$/ })).toHaveAttribute('aria-selected', 'true');
    // A long strip must scroll while dragging towards its edge.
    for (let i = 0; i < 8; i++) await openNote(`Long document title number ${i}`);
    await strip.evaluate(element => { element.scrollLeft = 0; });
    const longTab = strip.getByRole('tab', { name: /^Long document title number 0(?:, .+)?$/ });
    await longTab.scrollIntoViewIfNeeded();
    const source = (await longTab.boundingBox())!;
    const bounds = (await strip.boundingBox())!;
    const initialScroll = await strip.evaluate(element => element.scrollLeft);
    await page.mouse.move(source.x + 10, source.y + source.height / 2);
    await page.mouse.down();
    await page.mouse.move(bounds.x + bounds.width - 5, source.y + source.height / 2, { steps: 15 });
    await expect.poll(() => strip.evaluate(element => element.scrollLeft)).toBeGreaterThan(initialScroll);
    await page.keyboard.press('Escape');
    await page.mouse.up();
  } finally {
    await stopApp(app);
  }
});

test('tree guides connect mixed children and end at the last folder row', async () => {
  const { app, page } = await launchFixture('standard', true);
  try {
    await switchWorkspace(page, 'Local Vault');
    for (const name of ['Projects', 'Sub', 'Folders only', 'Last']) {
      const expand = page.getByRole('button', { name: `Expand ${name}`, exact: true });
      if (await expand.count()) await expand.click();
    }
    const assertGuides = async () => {
      // A closed folder keeps its rows mounted but hidden; only lists on screen draw guides.
      const problems = await page.locator('[data-tree-children]:visible').evaluateAll(lists => lists.flatMap(list => {
        const items = Array.from(list.children) as HTMLElement[];
        const lines = items.map(item => item.querySelector<HTMLElement>(':scope > [data-tree-guide], :scope > div > [data-tree-guide]')!);
        return lines.flatMap((line, index) => {
          const bounds = line.getBoundingClientRect();
          const failures: string[] = [];
          if (Math.abs(bounds.width - 1) > 0.1) failures.push('Guide is not 1px');
          if (index > 0) {
            const previous = lines[index - 1].getBoundingClientRect();
            if (Math.abs(previous.bottom - bounds.top) > 0.1 || Math.abs(previous.x - bounds.x) > 0.1) failures.push('Guide has a gap');
          }
          if (index === items.length - 1 && line.dataset.treeGuide === 'end') {
            const row = items[index].querySelector<HTMLElement>('[data-folder-tree-row-id]')!.getBoundingClientRect();
            if (bounds.bottom < row.bottom - 0.5) failures.push('Guide ends above the last row bottom');
          }
          return failures;
        });
      }));
      expect(problems).toEqual([]);
    };
    await expect(page.locator('[data-tree-children]')).toHaveCount(4);
    await assertGuides();
    await page.screenshot({ animations: 'disabled', path: test.info().outputPath('09-tree-guides.png') });
    await page.getByRole('button', { name: 'Collapse Last', exact: true }).click();
    await assertGuides();
    await page.getByRole('button', { name: 'Expand Last', exact: true }).click();
    await assertGuides();
  } finally {
    await stopApp(app);
  }
});

test('dropping a folder or a note on the workspace row moves it to the top level', async () => {
  const { app, page } = await launchFixture('standard', true);
  try {
    await switchWorkspace(page, 'Local Vault');
    for (const name of ['Projects', 'Sub']) {
      const expand = page.getByRole('button', { name: `Expand ${name}`, exact: true });
      if (await expand.count()) await expand.click();
    }
    const rootRow = page.locator('[data-folder-tree-kind="root"]');
    const dragOntoRoot = async (kind: 'note' | 'folder', name: string) => {
      const sourceRow = page.locator(`[data-folder-tree-kind="${kind}"]`).filter({ has: page.getByRole('treeitem', { name, exact: true }) });
      const source = (await sourceRow.getByRole('treeitem', { name, exact: true }).boundingBox())!;
      const target = (await rootRow.boundingBox())!;
      await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
      await page.mouse.down();
      await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 12 });
      await expect(sourceRow, `${name} is dragging`).toHaveAttribute('data-hackdesk-dragging');
      await page.mouse.up();
    };
    // Where a row lives: the folder whose group holds it, or null at the top level.
    const parentOf = (kind: 'note' | 'folder', name: string) => page.evaluate(([rowKind, rowName]) => {
      const row = [...document.querySelectorAll<HTMLElement>(`[data-folder-tree-kind="${rowKind}"]`)]
        .find(element => element.querySelector('[role="treeitem"]')?.getAttribute('aria-label') === rowName);
      if (!row) return 'missing';
      const folderItem = row.closest('ul[role="group"][data-tree-children]')?.closest('li');
      return folderItem?.querySelector('[data-folder-tree-kind="folder"] [role="treeitem"]')?.getAttribute('aria-label') ?? null;
    }, [kind, name] as const);

    expect(await parentOf('folder', 'Sub')).toBe('Projects');
    await dragOntoRoot('folder', 'Sub');
    await expect.poll(() => parentOf('folder', 'Sub')).toBeNull();

    expect(await parentOf('note', 'Direct')).toBe('Projects');
    await dragOntoRoot('note', 'Direct');
    await expect.poll(() => parentOf('note', 'Direct')).toBeNull();

    // With the tree scrolled, the workspace row stays pinned on top and still takes the drop.
    for (const name of ['Folders only', 'Last']) {
      const expand = page.getByRole('button', { name: `Expand ${name}`, exact: true });
      if (await expand.count()) await expand.click();
    }
    await page.setViewportSize({ width: 1100, height: 420 });
    const scroller = page.locator('aside .scroll-edges-source');
    // Scroll so Deep sits just under the pinned workspace row.
    await page.locator('[data-folder-tree-kind="note"]').getByRole('treeitem', { name: 'Deep', exact: true }).evaluate(element => {
      const scrollArea = element.closest<HTMLElement>('.scroll-edges-source')!;
      scrollArea.scrollTop += element.getBoundingClientRect().top - scrollArea.getBoundingClientRect().top - 60;
    });
    await expect.poll(() => scroller.evaluate(element => element.scrollTop)).toBeGreaterThan(40);
    expect(await parentOf('note', 'Deep')).toBe('Last');
    await dragOntoRoot('note', 'Deep');
    await expect.poll(() => parentOf('note', 'Deep')).toBeNull();

    // There is no separate drop area below the tree any more.
    await expect(page.getByText('Move to top level')).toHaveCount(0);
  } finally {
    await stopApp(app);
  }
});

test('a folder dropped on the middle of another moves inside it, on its top edge before it', async () => {
  const { app, page } = await launchFixture('standard', true);
  try {
    await switchWorkspace(page, 'Local Vault');
    for (const name of ['Projects', 'Sub']) {
      const expand = page.getByRole('button', { name: `Expand ${name}`, exact: true });
      if (await expand.count()) await expand.click();
    }
    const folderRow = (name: string) => page.locator('[data-folder-tree-kind="folder"]').filter({ has: page.getByRole('treeitem', { name, exact: true }) });
    const parentOf = (name: string) => page.evaluate((rowName) => {
      const row = [...document.querySelectorAll<HTMLElement>('[data-folder-tree-kind="folder"]')]
        .find(element => element.querySelector('[role="treeitem"]')?.getAttribute('aria-label') === rowName);
      if (!row) return 'missing';
      const folderItem = row.closest('ul[role="group"][data-tree-children]')?.closest('li');
      return folderItem?.querySelector('[data-folder-tree-kind="folder"] [role="treeitem"]')?.getAttribute('aria-label') ?? null;
    }, name);
    const topLevelFolders = () => page.evaluate(() => [...document.querySelectorAll<HTMLElement>('[data-folder-tree-kind="folder"]')]
      .filter(element => !element.closest('ul[role="group"][data-tree-children]'))
      .map(element => element.querySelector('[role="treeitem"]')?.getAttribute('aria-label')));
    // Drags `name` onto `target` at `fraction` of its row's height; checks the mark, then drops.
    // Wait for sortable layout transitions before measuring the target after the drag starts.
    const dragFolder = async (name: string, target: string, fraction: number, mark: string) => {
      const source = (await folderRow(name).getByRole('treeitem', { name, exact: true }).boundingBox())!;
      const targetRow = folderRow(target);
      await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
      await page.mouse.down();
      await page.mouse.move(source.x + source.width / 2 + 8, source.y + source.height / 2, { steps: 2 });
      await expect(folderRow(name)).toHaveAttribute('data-hackdesk-dragging');
      await targetRow.hover({ trial: true });
      const bounds = (await targetRow.boundingBox())!;
      // A fast move must update the target even when there is no second move within that row.
      await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height * fraction);
      await expect(targetRow).toHaveAttribute('data-drop-placement', mark);
      await page.mouse.up();
      await expect(targetRow).not.toHaveAttribute('data-drop-placement');
    };

    expect(await parentOf('Folders only')).toBeNull();
    await dragFolder('Folders only', 'Projects', 0.5, 'inside');
    await expect.poll(() => parentOf('Folders only')).toBe('Projects');

    expect(await parentOf('Sub')).toBe('Projects');
    await dragFolder('Sub', 'Projects', 0.1, 'before');
    // A local vault lists folders by name, so only the move to the top level shows.
    await expect.poll(() => parentOf('Sub')).toBeNull();
    await expect.poll(topLevelFolders).toEqual(['Projects', 'Sub']);
  } finally {
    await stopApp(app);
  }
});

test('tree rows drag by their title, with no grip on hover', async () => {
  const { app, page } = await launchFixture('standard', true);
  try {
    await switchWorkspace(page, 'Local Vault');
    const tree = page.locator('aside');
    const row = (kind: 'note' | 'folder', name: string) => page.locator(`[data-folder-tree-kind="${kind}"]`).filter({ has: page.getByRole('treeitem', { name, exact: true }) });
    const alpha = row('note', 'Alpha');
    const projects = row('folder', 'Projects');
    await alpha.hover();
    await expect(alpha.locator('.lucide-grip-vertical')).toHaveCount(0);
    await projects.hover();
    await expect(projects.getByRole('button', { name: 'Drag Projects', exact: true })).toHaveCSS('opacity', '0');

    // A folder starts dragging from its title; Escape cancels.
    const folderBox = (await projects.getByRole('treeitem', { name: 'Projects', exact: true }).boundingBox())!;
    await page.mouse.move(folderBox.x + folderBox.width / 2, folderBox.y + folderBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(folderBox.x + folderBox.width / 2, folderBox.y + folderBox.height / 2 + 30, { steps: 6 });
    await expect(projects).toHaveAttribute('data-hackdesk-dragging');
    await page.keyboard.press('Escape');
    await page.mouse.up();
    await expect(projects).not.toHaveAttribute('data-hackdesk-dragging');

    // A note dropped on a folder by its title moves into it.
    const source = (await alpha.getByRole('treeitem', { name: 'Alpha', exact: true }).boundingBox())!;
    const target = (await projects.getByRole('treeitem', { name: 'Projects', exact: true }).boundingBox())!;
    await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
    await page.mouse.down();
    await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 12 });
    await page.mouse.up();
    await expect.poll(() => tree.evaluate(() => {
      const alphaRow = [...document.querySelectorAll<HTMLElement>('[data-folder-tree-kind="note"]')].find(element => element.querySelector('[role="treeitem"]')?.getAttribute('aria-label') === 'Alpha');
      const folderItem = alphaRow?.closest('ul[role="group"]')?.closest('li');
      return folderItem?.querySelector('[data-folder-tree-kind="folder"] [role="treeitem"]')?.getAttribute('aria-label') ?? null;
    })).toBe('Projects');
  } finally {
    await stopApp(app);
  }
});

for (const editorMode of ['standard', 'vim', 'helix', 'emacs', 'kakoune'] as const) {
  test(`Note Details focus and toast layering in ${editorMode} mode`, async () => {
    const testInfo = test.info();
    const { app, page } = await launchFixture(editorMode);
    try {
      await switchWorkspace(page, 'My Workspace');
      await page.locator('[data-folder-tree-kind="note"]').getByRole('treeitem', { name: 'Remote UI fixture', exact: true }).click();
      await page.getByRole('button', { name: 'Expand note details', exact: true }).click();
      const tags = page.getByRole('textbox', { name: 'Tags', exact: true });
      await tags.focus();
      await expectInsetFocus(tags.locator('..'), true);
      const removeTag = page.getByRole('button', { name: 'Remove playground tag', exact: true });
      const removeBounds = (await removeTag.boundingBox())!;
      expect(Math.min(removeBounds.width, removeBounds.height)).toBeGreaterThanOrEqual(24);
      await page.screenshot({ animations: 'disabled', path: testInfo.outputPath('06-note-details.png') });
      for (const label of ['Description', 'Permalink']) {
        const field = page.getByLabel(label, { exact: true });
        await field.focus();
        await expectInsetFocus(field);
      }
      await page.getByRole('button', { name: /Location/ }).click();
      const folder = page.getByRole('combobox', { name: 'Folder', exact: true });
      await page.keyboard.press('Tab');
      await folder.focus();
      await expectInsetFocus(folder);
      await page.getByRole('button', { name: /Permissions/ }).click();
      const read = page.getByRole('group', { name: 'Read', exact: true }).getByRole('radio', { name: 'Owner', exact: true });
      await page.keyboard.press('Tab');
      await read.focus();
      await expectInsetFocus(read);
      await page.getByRole('button', { name: 'Collapse note details', exact: true }).click();
      await openFixtureNote(page);
      await page.locator('.cm-content').click();
      await page.keyboard.press(`${primary}+f`);
      await expect(page.locator('.cm-panels').first()).toBeVisible();
      await expect(page.locator('.cm-editor')).toHaveCSS('isolation', 'isolate');
      // Save uses real filesystem IPC. Routine saves are quiet; Rename Note confirms with a real
      // notification. It saves right away, from the leader menu in every editor mode.
      await page.keyboard.press(`${primary}+j`);
      await page.keyboard.press('n');
      await page.keyboard.press('r');
      const rename = page.getByRole('dialog', { name: 'Rename Note' });
      await rename.getByLabel('Title').fill(`UI fixture ${editorMode}`);
      await rename.getByRole('button', { name: 'Rename', exact: true }).click();
      const notification = page.getByRole('status').filter({ hasText: `Renamed to “UI fixture ${editorMode}”.` });
      await expect(notification).toBeVisible();
      const bottomPanels = page.locator('.cm-panels-bottom');
      const panels = await bottomPanels.count() ? bottomPanels : page.locator('.cm-panels-top');
      // Force overlap with the real panel regardless of window geometry. Move
      // only the viewport; leave every z-index and stacking context untouched.
      const panel = (await panels.boundingBox())!;
      const viewport = page.getByLabel('Notifications', { exact: true });
      const viewportHeight = (await viewport.boundingBox())!.height;
      await viewport.evaluate((element, top) => {
        element.style.bottom = 'auto';
        element.style.top = `${top}px`;
      }, panel.y + panel.height - viewportHeight - 4);
      const toastBounds = (await notification.boundingBox())!;
      const panelBounds = (await panels.boundingBox())!;
      const left = Math.max(toastBounds.x, panelBounds.x);
      const right = Math.min(toastBounds.x + toastBounds.width, panelBounds.x + panelBounds.width);
      const top = Math.max(toastBounds.y, panelBounds.y);
      const bottom = Math.min(toastBounds.y + toastBounds.height, panelBounds.y + panelBounds.height);
      expect(right - left).toBeGreaterThan(0);
      expect(bottom - top).toBeGreaterThan(0);
      expect(await notification.evaluate((element, point) => element.contains(document.elementFromPoint(point.x, point.y)), {
        x: (left + right) / 2, y: (top + bottom) / 2,
      })).toBe(true);
      await page.screenshot({ animations: 'disabled', path: testInfo.outputPath('07-toast-status.png') });
    } finally {
      await stopApp(app);
    }
  });
}

test('keyboard foundation separates focus from selection and protects drafts', async () => {
  const { app, page } = await launchFixture('standard', true, true);
  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    await switchWorkspace(page, 'Local Vault');
    const tree = page.getByRole('tree', { name: 'Folders and notes' });
    const alpha = tree.getByRole('treeitem', { name: 'Alpha', exact: true });
    const beta = tree.getByRole('treeitem', { name: 'Beta', exact: true });
    await alpha.click();
    await beta.focus();
    await expect(page.locator('.cm-content')).toContainText('# Alpha');
    await beta.press('Enter');
    await expect(page.locator('.cm-content')).toContainText('# Beta');
    const firstTab = page.getByRole('tab', { name: /^Alpha(?:, .+)?$/ });
    const secondTab = page.getByRole('tab', { name: /^Beta(?:, .+)?$/ });
    await secondTab.focus();
    await secondTab.press('ArrowLeft');
    await expect(firstTab).toBeFocused();
    await expect(secondTab).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('.cm-content')).toContainText('# Beta');
    await firstTab.press('Enter');
    await expect(firstTab).toHaveAttribute('aria-selected', 'true');
    const panelId = await firstTab.getAttribute('aria-controls');
    const panel = page.getByRole('tabpanel');
    await expect(panel).toHaveAttribute('id', panelId!);
    await expect(panel).toHaveAttribute('aria-labelledby', (await firstTab.getAttribute('id'))!);
    // A saved tab is named by its title alone.
    await expect(firstTab).toHaveAccessibleName('Alpha');

    const projects = tree.getByRole('treeitem', { name: 'Projects', exact: true });
    await projects.focus();
    // Native Tab traversal enters on the node, then visits its owned controls.
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    await expect(projects).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: /^(Expand|Collapse) Projects$/ })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Drag Projects', exact: true })).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Shift+Tab');
    await expect(projects).toBeFocused();
    await projects.press('ArrowRight');
    await expect(projects).toHaveAttribute('aria-expanded', 'true');
    await projects.press('ArrowRight');
    await expect(tree.getByRole('treeitem', { name: 'Sub', exact: true })).toBeFocused();
    await page.getByRole('button', { name: 'Collapse Projects', exact: true }).click();
    await expect(projects).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('.cm-content')).toContainText('# Alpha');
    await alpha.focus();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    await expect(alpha).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Drag Alpha', exact: true })).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(alpha).toBeFocused();
    await alpha.press('End');
    await expect(tree.getByRole('treeitem').last()).toBeFocused();
    await page.screenshot({ path: test.info().outputPath('11-tree-keyboard-focus.png'), animations: 'disabled' });
    await writeFile(test.info().outputPath('tree-accessibility.yml'), await tree.ariaSnapshot());

    // Enter on Close goes through the existing draft-confirmation flow.
    await page.locator('.cm-content').fill('Unsaved keyboard navigation draft');
    await expect(firstTab).toHaveAccessibleName('Alpha, Unsaved');
    const close = page.getByRole('button', { name: 'Close Alpha', exact: true });
    await close.focus();
    await close.press('Enter');
    const closeDialog = page.getByRole('alertdialog');
    await expect(closeDialog.getByRole('button', { name: 'Keep Editing' })).toBeVisible();
    await closeDialog.getByRole('button', { name: 'Keep Editing' }).click();
    await expect(firstTab).toBeVisible();
    await expect(page.locator('.cm-content')).toContainText('Unsaved keyboard navigation draft');
    await close.press('Enter');
    await closeDialog.getByRole('button', { name: 'Close Tab' }).click();
    await expect(firstTab).toHaveCount(0);
    await expect(secondTab).toBeFocused();
    await page.screenshot({ path: test.info().outputPath('12-tab-keyboard-focus.png'), animations: 'disabled' });
  } finally { await stopApp(app, false); }
});

test('pane promotion and workspace restore do not replay editor commands', async () => {
  const { app, page } = await launchFixture('standard', true, true);
  try {
    await page.setViewportSize({ width: 1600, height: 900 });
    await openFixtureNote(page);
    await page.getByRole('button', { name: 'Pane actions', exact: true }).press('Enter');
    await page.getByRole('menuitem', { name: 'Split Right', exact: true }).press('Enter');
    const panes = page.locator('[data-document-pane-id][data-active-pane]');
    const left = panes.first();
    const right = panes.last();
    await expect(page.locator('.cm-content')).toHaveCount(2);
    // Count picker requests without leaving native file dialogs open in CI.
    await page.evaluate(() => {
      const original = HTMLInputElement.prototype.click;
      HTMLInputElement.prototype.click = function () {
        if (this.type !== 'file') return original.call(this);
        this.dataset.pickerRequests = String(Number(this.dataset.pickerRequests ?? 0) + 1);
      };
    });
    const attachViaMenu = () => app.evaluate(({ Menu }) => {
      const item = Menu.getApplicationMenu()?.items.find(section => section.label === 'File')
        ?.submenu?.items.find(candidate => candidate.label === 'Attach Image...');
      if (!item) throw new Error('Attach Image menu item is missing');
      item.click(item, undefined, {});
    });
    await left.locator('.cm-content').focus();
    await page.keyboard.press(`${primary}+f`);
    await expect(left.locator('.cm-search')).toBeVisible();
    await left.getByRole('button', { name: 'Close search', exact: true }).click();
    await attachViaMenu();
    await expect(left.locator('input[type="file"]')).toHaveAttribute('data-picker-requests', '1');
    await left.locator('.cm-content').focus();
    await page.keyboard.press('F6');
    await expect(right.locator('.cm-content')).toBeFocused();
    await expect(right.locator('.cm-search')).toHaveCount(0);
    await expect(right.locator('input[type="file"]')).not.toHaveAttribute('data-picker-requests');
    await attachViaMenu();
    await expect(right.locator('input[type="file"]')).toHaveAttribute('data-picker-requests', '1');
    await page.screenshot({ path: test.info().outputPath('14-pane-command-isolation.png'), animations: 'disabled' });
    await left.locator('.cm-content').click();
    await expect(left.locator('.cm-search')).toHaveCount(0);
    await expect(left.locator('input[type="file"]')).toHaveAttribute('data-picker-requests', '1');
    await switchWorkspace(page, 'My Workspace');
    await switchWorkspace(page, 'Local Vault');
    await expect(page.locator('.cm-content')).toHaveCount(2);
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await expect(page.locator('.cm-search')).toHaveCount(0);
    for (const input of await page.locator('input[type="file"]').all()) {
      await expect(input).not.toHaveAttribute('data-picker-requests');
    }
  } finally { await stopApp(app, false); }
});

for (const mode of ['standard', 'vim', 'helix', 'emacs', 'kakoune'] as const) {
  test(`F6 cycles both panes and restores focus in ${mode}`, async () => {
    test.setTimeout(120_000);
    const { app, page } = await launchFixture(mode, true, false);
    try {
      await page.setViewportSize({ width: 1600, height: 900 });
      await openFixtureNote(page);
      await page.getByRole('button', { name: 'Pane actions', exact: true }).press('Enter');
      await page.getByRole('menuitem', { name: 'Split Right', exact: true }).press('Enter');
      const editors = page.locator('.cm-content');
      await expect(editors).toHaveCount(2);
      const tree = page.getByRole('treeitem', { name: 'UI fixture', exact: true });
      await tree.focus();
      await page.keyboard.press('F6');
      await expect(page.getByRole('tab', { name: /^UI fixture(?:, .+)?$/ })).toBeFocused();
      await page.keyboard.press('F6');
      await expect(editors.first()).toBeFocused();
      await expect(editors.first().locator('xpath=ancestor::section[@data-active-pane][1]')).toHaveAttribute('data-active-pane', 'true');
      await page.keyboard.press('F6');
      await expect(editors.last()).toBeFocused();
      await page.keyboard.press('F6');
      await expect(tree).toBeFocused();
      await page.keyboard.press('Shift+F6');
      await expect(editors.last()).toBeFocused();
      // A field is remembered on return, while collapsed regions are skipped.
      const search = page.getByPlaceholder('Search notes', { exact: true });
      await search.focus();
      await page.keyboard.press('F6');
      await expect(page.getByRole('tab').first()).toBeFocused();
      await page.keyboard.press('Shift+F6');
      await expect(search).toBeFocused();
      await editors.last().focus();
      await page.keyboard.press('Control+d');
      await expect(search).not.toBeFocused();
      await page.keyboard.press('?');
      await expect(page.getByRole('dialog', { name: 'Keyboard Shortcuts', exact: true })).toHaveCount(0);
      await page.keyboard.press('Escape');
      await page.getByRole('toolbar', { name: 'Application controls', exact: true }).getByRole('button', { name: 'Collapse sidebar', exact: true }).click();
      await editors.last().focus();
      await page.keyboard.press('F6');
      await expect(page.getByRole('tab').first()).toBeFocused();
      await page.screenshot({ path: test.info().outputPath(`13-f6-${mode}.png`), animations: 'disabled' });
    } finally {
      // Typing ? intentionally dirties Standard mode. Approve only fixture
      // cleanup after the behavior checks; quit confirmation is tested separately.
      await app.evaluate(({ ipcMain }, channel) => {
        ipcMain.removeHandler(channel);
        ipcMain.handle(channel, () => ({ confirmed: true }));
      }, ELECTRON_CHANNELS.appConfirm);
      await stopApp(app, false);
    }
  });
}

test('shortcut help is searchable in light and dark and restores focus', async () => {
  const { app, page } = await launchFixture('standard', true);
  try {
    await page.setViewportSize({ width: 1280, height: 760 });
    await openFixtureNote(page);
    const note = page.getByRole('treeitem', { name: 'UI fixture', exact: true });
    await note.focus();
    await page.keyboard.press('?');
    const help = page.getByRole('dialog', { name: 'Keyboard Shortcuts', exact: true });
    await expect(help).toBeVisible();
    await expect(help.getByPlaceholder('Search keyboard shortcuts')).toBeFocused();
    await expect(help.getByRole('button', { name: 'Current Region: Sidebar' })).toHaveAttribute('aria-pressed', 'true');
    await help.getByRole('button', { name: 'All Actions' }).click();
    await help.getByPlaceholder('Search keyboard shortcuts').fill('half page');
    await expect(help.getByText('Scroll Half Page Down', { exact: true })).toBeVisible();
    await page.screenshot({ path: test.info().outputPath('14-shortcut-help-dark.png'), animations: 'disabled' });
    await page.evaluate(theme => { for (const [name, value] of Object.entries(theme)) document.documentElement.style.setProperty(name, value); }, resolveHackDeskTheme({ presetId: 'hackmd-neo', mode: 'light' }));
    await expect(help.getByText('Scroll Half Page Down', { exact: true })).toBeVisible();
    await page.screenshot({ path: test.info().outputPath('16-shortcut-help-light.png'), animations: 'disabled' });
    await page.keyboard.press('Escape');
    await expect(help).toHaveCount(0);
    await expect(note).toBeFocused();
  } finally { await stopApp(app); }
});

test('character shortcuts preserve text input and half-page scrolling preserves the note', async () => {
  const { app, page } = await launchFixture('standard', true);
  try {
    await page.setViewportSize({ width: 1280, height: 760 });
    await openFixtureNote(page);
    const note = page.getByRole('treeitem', { name: 'UI fixture', exact: true });
    const help = page.getByRole('dialog', { name: 'Keyboard Shortcuts', exact: true });
    await note.focus();
    await page.keyboard.press('/');
    const search = page.getByPlaceholder('Search notes', { exact: true });
    await expect(search).toBeFocused();
    await expect(page.locator('[data-search-shortcut]')).toHaveText('/');
    await page.keyboard.type('?/');
    await expect(search).toHaveValue('?/');
    await expect(help).toHaveCount(0);
    await search.fill('');

    // Focused scroll region moves half a page without changing the active note.
    await note.focus();
    const before = await note.evaluate(element => {
      let parent = element.parentElement;
      while (parent && !/(auto|scroll)/.test(getComputedStyle(parent).overflowY)) parent = parent.parentElement;
      if (!parent) throw new Error('Missing navigator scroll region');
      Object.assign(parent.style, { maxHeight: '120px', minHeight: '120px' });
      parent.scrollTop = 0;
      return { top: parent.scrollTop, height: parent.clientHeight };
    });
    await page.keyboard.press('Control+d');
    const after = await note.evaluate(element => {
      let parent = element.parentElement;
      while (parent && !/(auto|scroll)/.test(getComputedStyle(parent).overflowY)) parent = parent.parentElement;
      return parent!.scrollTop;
    });
    expect(after).toBeCloseTo(before.height / 2, 0);
    await expect(page.locator('.cm-content')).toContainText('Test note for layout checks.');
  } finally { await stopApp(app); }
});

test('saved shortcut preferences update hints and disable character shortcuts', async () => {
  const { app, page } = await launchFixture('standard', true);
  try {
    await page.setViewportSize({ width: 1280, height: 760 });
    await openFixtureNote(page);
    const note = page.getByRole('treeitem', { name: 'UI fixture', exact: true });
    const help = page.getByRole('dialog', { name: 'Keyboard Shortcuts', exact: true });
    const search = page.getByPlaceholder('Search notes', { exact: true });
    await note.focus();
    await page.keyboard.press('?');
    await help.getByRole('button', { name: 'Customize in Settings' }).click();
    const settings = page.getByRole('dialog', { name: 'Settings', exact: true });
    await expect(help).toHaveCount(0);
    await expect(settings).toBeVisible();
    await expect(settings.getByRole('tab', { name: 'Shortcuts', exact: true })).toHaveAttribute('aria-selected', 'true');
    await settings.getByRole('switch', { name: 'Enable ?, / and Space outside text editing' }).uncheck();
    const filter = settings.getByPlaceholder('Search shortcuts', { exact: true });
    await filter.fill('Focus Note Finder');
    const binding = settings.getByRole('button', { name: 'Set shortcut for Focus Note Finder', exact: true });
    await binding.click(); await page.keyboard.press(`${primary}+e`);
    await settings.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(settings).toBeHidden();
    // Closed, the search icon names its shortcut in its tooltip.
    await expect(page.locator('label:has(input[name="noteSearch"])')).toHaveAttribute('title', `Search notes (${process.platform === 'darwin' ? '⌘E' : 'Ctrl+E'})`);
    const shortcutsButton = page.getByRole('note', { name: 'Keys you can press' }).getByRole('button', { name: /Shortcuts/ });
    await expect(shortcutsButton.locator('kbd')).toHaveCount(0);
    await shortcutsButton.click();
    await expect(help).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(help).toHaveCount(0);
    await note.focus(); await page.keyboard.press('?');
    await expect(help).toHaveCount(0);
    await page.keyboard.press('/'); await expect(search).not.toBeFocused();
    await page.keyboard.press(`${primary}+e`); await expect(search).toBeFocused();
    await page.screenshot({ path: test.info().outputPath('15-custom-search-hint.png'), animations: 'disabled' });
  } finally { await stopApp(app); }
});

test('native help and palette region commands restore Workbench focus', async () => {
  const { app, page } = await launchFixture('standard', true);
  try {
    await page.setViewportSize({ width: 1280, height: 760 });
    await openFixtureNote(page);
    const help = page.getByRole('dialog', { name: 'Keyboard Shortcuts', exact: true });
    // A native menu still exposes help from the editor, without registering ?.
    await page.locator('.cm-content').focus();
    await app.evaluate(({ Menu }) => {
      const entry = Menu.getApplicationMenu()!.items.find(section => section.label === 'Help')!.submenu!.items.find(item => item.label.startsWith('Keyboard Shortcuts'))!;
      expectNoAccelerator(entry.accelerator);
      entry.click();
      function expectNoAccelerator(accelerator: string | null | undefined) { if (accelerator) throw new Error('Context key registered natively'); }
    });
    await expect(help).toBeVisible();
    await expect(help.getByRole('button', { name: 'Current Region: Editor' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('.cm-content')).toBeFocused();
    await page.keyboard.press(`${primary}+k`);
    await page.getByRole('combobox', { name: 'Search notes, folders, and commands' }).fill('Next Workbench Region');
    await page.getByRole('option', { name: /^Next Workbench Region / }).click();
    await expect.poll(() => page.evaluate(() => Boolean(document.activeElement?.closest('[data-hackdesk-focus="navigator"]')))).toBe(true);
  } finally { await stopApp(app); }
});

async function useNavigationCode(page: Page, id: string) {
  const hint = page.locator('[data-navigation-hint]');
  const target = page.locator(`[data-navigation-hint="${id}"]`);
  await expect(target).toHaveCount(1, { timeout: 10_000 });
  const code = await target.getAttribute('data-navigation-code');
  if (!code) throw new Error(`Missing navigation code for ${id}`);
  for (const letter of code) await page.keyboard.press(letter);
  await expect(hint).toHaveCount(0);
}

test('a quick Cmd chord in a note moves the cursor without flashing navigation hints', async () => {
  const { app, page } = await launchFixture('standard');
  try {
    await openFixtureNote(page);
    const overlay = page.locator('[data-keyboard-navigation-overlay]');
    await page.locator('.cm-content').click();
    await page.keyboard.press('Home');
    await page.keyboard.down(primary);
    await page.keyboard.press(process.platform === 'darwin' ? 'ArrowRight' : 'End');
    await page.waitForTimeout(600);
    await expect(overlay).toHaveCount(0);
    await page.keyboard.up(primary);
    await expect(page.locator('.cm-content')).toBeFocused();
  } finally { await stopApp(app); }
});

test('navigation codes are stable, prefix-free and do not overlap', async () => {
  const { app, page } = await launchFixture('standard', true);
  try {
    await page.setViewportSize({ width: 1280, height: 760 });
    await openFixtureNote(page);
    const note = page.getByRole('treeitem', { name: 'UI fixture', exact: true });
    await holdForHints(page, note);
    const overlay = page.locator('[data-keyboard-navigation-overlay]');
    const hints = await page.locator('[data-navigation-code]').evaluateAll(elements => elements.map(element => ({ id: element.getAttribute('data-navigation-hint'), code: element.getAttribute('data-navigation-code')! })));
    expect(new Set(hints.map(hint => hint.code)).size).toBe(hints.length);
    for (const a of hints) for (const b of hints) if (a.id !== b.id) expect(a.code.startsWith(b.code)).toBe(false);
    const boxes = await page.locator('[data-navigation-hint]').evaluateAll(elements => elements.map(element => { const rect = element.getBoundingClientRect(); return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom }; }));
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      expect(a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top, `Hint ${i} overlaps ${j}`).toBe(false);
    }
    await page.screenshot({ path: test.info().outputPath('17-held-navigation-dark.png'), animations: 'disabled' });
    const finderCode = await page.locator('[data-navigation-hint="finder"]').getAttribute('data-navigation-code');
    await page.keyboard.press(finderCode![0]);
    await expect.poll(() => page.locator('[data-navigation-code]').evaluateAll(elements => elements.every(element => element.getAttribute('data-navigation-code')!.startsWith(elements[0].getAttribute('data-navigation-code')![0])))).toBe(true);
    await page.keyboard.press('Backspace');
    await useNavigationCode(page, 'finder');
    await expect(page.getByPlaceholder('Search notes', { exact: true })).toBeFocused();
    await page.keyboard.up(primary);
    await note.focus(); await holdPrimary(page);
    await expect(page.locator('[data-navigation-hint="finder"]')).toHaveAttribute('data-navigation-code', finderCode!);
    await page.keyboard.press('Escape'); await expect(overlay).toHaveCount(0);
    await page.keyboard.up(primary);
  } finally { await stopApp(app); }
});

test('navigation focuses buttons before Enter and preserves fixed shortcuts', async () => {
  const { app, page } = await launchFixture('standard', true);
  try {
    await page.setViewportSize({ width: 1280, height: 760 });
    await openFixtureNote(page);
    const note = page.getByRole('treeitem', { name: 'UI fixture', exact: true });
    await note.focus();
    await holdPrimary(page);
    const saveHint = page.locator('[data-navigation-hint$=":save-note"]');
    // Saved notes disable Save; mutation controls are never activated by hints.
    await expect(saveHint).toHaveCount(0);
    const collapseHint = page.locator('[data-navigation-hint="toolbar::Application controls:toggle-navigator"]');
    const collapseCode = await collapseHint.getAttribute('data-navigation-code');
    const navigator = page.locator('[data-hackdesk-focus="navigator"]');
    const width = (await navigator.boundingBox())!.width;
    for (const letter of collapseCode!) await page.keyboard.press(letter);
    await expect(page.getByRole('toolbar', { name: 'Application controls' }).getByRole('button', { name: 'Collapse sidebar', exact: true })).toBeFocused();
    expect((await navigator.boundingBox())!.width).toBe(width);
    await page.keyboard.up(primary); await page.keyboard.press('Enter');
    await expect(page.getByRole('button', { name: 'Expand sidebar', exact: true })).toBeVisible();
    await page.keyboard.press(`${primary}+b`);
    await expect(page.getByRole('button', { name: 'Collapse sidebar', exact: true })).toBeVisible();

    await note.focus(); await holdPrimary(page);
    await page.keyboard.press('b'); await page.keyboard.up(primary);
    await expect(page.getByRole('button', { name: 'Expand sidebar', exact: true })).toBeVisible();
    await page.keyboard.press(`${primary}+b`);
    await expect(page.getByRole('button', { name: 'Collapse sidebar', exact: true })).toBeVisible();
  } finally { await stopApp(app); }
});

test('navigation hints cancel for popups, blur and IME', async () => {
  const { app, page } = await launchFixture('standard', true);
  try {
    await page.setViewportSize({ width: 1280, height: 760 });
    await openFixtureNote(page);
    const note = page.getByRole('treeitem', { name: 'UI fixture', exact: true });
    const overlay = page.locator('[data-keyboard-navigation-overlay]');
    await page.keyboard.press(`${primary}+k`);
    await expect(page.getByRole('dialog', { name: 'Command Palette', exact: true })).toBeVisible();
    await holdPrimary(page); await expect(overlay).toHaveCount(0); await page.keyboard.up(primary); await page.keyboard.press('Escape');

    await note.focus(); await holdPrimary(page);
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await expect(overlay).toHaveCount(0); await page.keyboard.up(primary);
    await note.focus(); await holdPrimary(page);
    await page.evaluate(() => window.dispatchEvent(new CompositionEvent('compositionstart')));
    await expect(overlay).toHaveCount(0); await page.keyboard.up(primary);
  } finally { await stopApp(app); }
});

for (const mode of ['standard', 'vim', 'helix', 'emacs', 'kakoune'] as const) {
  test(`held navigation preserves editor bindings and reaches both panes in ${mode}`, async () => {
    const { app, page } = await launchFixture(mode, true);
    try {
      await page.setViewportSize({ width: 1440, height: 900 });
      await openFixtureNote(page);
      await page.getByRole('button', { name: 'Pane actions', exact: true }).press('Enter');
      await page.getByRole('menuitem', { name: 'Split Right', exact: true }).press('Enter');
      const editors = page.locator('.cm-content');
      await expect(editors).toHaveCount(2);
      const before = await editors.allTextContents();
      await editors.last().focus();
      await holdPrimary(page);
      await expect(page.locator('[data-keyboard-navigation-overlay]')).toBeAttached();
      // Without safe letters in this editor, codes stay hidden and nothing explains it, to keep the editor quiet.
      if (!(await page.locator('[data-navigation-code]').count())) {
        await expect(page.locator('[data-keyboard-navigation-overlay]')).not.toContainText('No safe navigation keys');
      } else {
        const id = await page.locator('[data-navigation-hint^="editor:"]').first().getAttribute('data-navigation-hint');
        await useNavigationCode(page, id!);
        await expect(editors.first()).toBeFocused();
      }
      await page.keyboard.up(primary);
      // Navigation from a Workbench region remains available even if the active editor exhausts safe keys.
      await page.getByRole('button', { name: /^Switch workspace, current: / }).focus();
      await holdPrimary(page);
      const editorHints = page.locator('[data-navigation-hint^="editor:"]');
      await expect(editorHints).toHaveCount(2);
      await useNavigationCode(page, (await editorHints.first().getAttribute('data-navigation-hint'))!);
      await expect(editors.first()).toBeFocused();
      await page.keyboard.up(primary);
      await expect(page.locator('[data-keyboard-navigation-overlay]')).toHaveCount(0);
      await expect(editors.first()).toHaveText(before[0]);
      await expect(editors.last()).toHaveText(before[1]);
    } finally { await stopApp(app); }
  });
}

test('navigation follows visible tabs and tree targets and cancels changed contexts', async () => {
  const { app, page } = await launchFixture('standard', true);
  try {
    await page.setViewportSize({ width: 1280, height: 760 });
    await openFixtureNote(page);
    const ui = page.getByRole('treeitem', { name: 'UI fixture', exact: true });
    await ui.focus(); await holdPrimary(page);
    const betaRow = page.locator('[data-folder-tree-kind="note"]').filter({has:page.getByRole('treeitem',{name:'Beta',exact:true})});
    const betaId = await betaRow.getAttribute('data-folder-tree-row-id');
    await useNavigationCode(page, `tree:${betaId}`); await page.keyboard.up(primary);
    await expect(page.locator('.cm-content')).toContainText('# Beta');
    const uiTab = page.getByRole('tab', { name: /^UI fixture(?:, .+)?$/ });
    await uiTab.scrollIntoViewIfNeeded(); await uiTab.focus(); await holdPrimary(page);
    await useNavigationCode(page, `tab:${await uiTab.getAttribute('data-navigation-tab-id')}`); await page.keyboard.up(primary);
    await expect(uiTab).toHaveAttribute('aria-selected','true');
    await expect(page.locator('.cm-content')).toContainText('Test note for layout checks.');
    // Horizontally clipped tabs receive no code; scrolling changes the target set and cancels the hold.
    const tabNav = page.getByRole('navigation', { name: 'Open documents', exact: true });
    await tabNav.evaluate(element => { element.style.flex = 'none'; element.style.width = '100px'; element.scrollLeft = 0; });
    await ui.focus(); await holdPrimary(page);
    const tabHints = await page.locator('[data-navigation-hint^="tab:"]').count();
    expect(tabHints).toBeLessThan(await page.getByRole('tablist', { name: 'Open documents', exact: true }).getByRole('tab').count());
    await tabNav.evaluate(element => { element.scrollLeft = element.scrollWidth; });
    await expect(page.locator('[data-keyboard-navigation-overlay]')).toHaveCount(0);
    await page.keyboard.up(primary);
    await tabNav.evaluate(element => { element.style.flex = ''; element.style.width = ''; });
    await page.getByRole('treeitem',{name:'Projects',exact:true}).scrollIntoViewIfNeeded();
    const projects = page.getByRole('treeitem',{name:'Projects',exact:true});
    const folderId = await projects.evaluate(element=>element.closest('[data-folder-tree-row-id]')!.getAttribute('data-folder-tree-row-id'));
    await projects.focus(); await holdPrimary(page);
    await useNavigationCode(page, `tree:${folderId}`); await page.keyboard.up(primary);
    await expect(projects).toBeFocused();
    await page.keyboard.press(`${primary}+Shift+n`);
    const createNoteDialog = page.getByRole('dialog', {name:'New Note',exact:true});
    await expect(createNoteDialog.getByText('Local Vault / Projects',{exact:true})).toBeVisible();
    await createNoteDialog.getByRole('button',{name:'Cancel',exact:true}).click();
    // Each hold fixes its visible target set; collapsing a folder cancels it.
    await projects.focus(); await holdPrimary(page);
    await page.getByRole('button', {name:'Collapse Projects',exact:true}).evaluate(element => (element as HTMLButtonElement).click());
    await expect(page.locator('[data-keyboard-navigation-overlay]')).toHaveCount(0);
    await page.keyboard.up(primary);
    await projects.press('ArrowRight'); await holdPrimary(page);
    await page.evaluate(()=>document.querySelector('[data-folder-tree-ignore-keyboard]')?.setAttribute('data-hackdesk-dragging','true'));
    await expect(page.locator('[data-keyboard-navigation-overlay]')).toHaveCount(0);
    await page.keyboard.up(primary);
    await page.evaluate(()=>document.querySelector('[data-hackdesk-dragging]')?.removeAttribute('data-hackdesk-dragging'));
    for (const mode of ['light', 'dark'] as const) {
      await page.evaluate(theme => {
        for (const [name, value] of Object.entries(theme)) document.documentElement.style.setProperty(name, value);
      }, resolveHackDeskTheme({ presetId: 'hackmd-neo', mode }));
      await projects.focus();
      await holdPrimary(page);
      await expect(page.locator('[data-navigation-hint="finder"]')).toBeVisible();
      if (mode === 'light') await page.screenshot({ path: test.info().outputPath('18-held-navigation-light.png'), animations: 'disabled' });
      await page.keyboard.up(primary);
    }
  } finally { await stopApp(app); }
});

test('navigation codes avoid saved custom shortcuts', async () => {
  const { app, page } = await launchFixture('standard', true);
  try {
    await page.setViewportSize({ width: 1280, height: 760 });
    await openFixtureNote(page);
    const note = page.getByRole('treeitem', { name: 'UI fixture', exact: true });
    await page.keyboard.press(`${primary}+,`);
    const settings = page.getByRole('dialog',{name:'Settings',exact:true});
    await settings.getByRole('tab',{name:'Shortcuts',exact:true}).click();
    await settings.getByPlaceholder('Search shortcuts',{exact:true}).fill('New Note');
    await settings.getByRole('button',{name:'Set shortcut for New Note',exact:true}).click();
    await page.keyboard.press(`${primary}+e`);
    await settings.getByRole('button',{name:'Save',exact:true}).click();
    await expect(settings).toBeHidden(); await note.focus(); await holdPrimary(page);
    const codes = await page.locator('[data-navigation-code]').evaluateAll(elements=>elements.map(element=>element.getAttribute('data-navigation-code')));
    expect(codes.every(code=>!code?.includes('e'))).toBe(true);
    await expect(page.locator('[data-navigation-hint="finder"]')).toHaveAttribute('data-navigation-code', /^[a-z]{2,3}$/);
    await page.keyboard.up(primary);
  } finally { await stopApp(app); }
});

test('onboarding stays compact at wide and narrow window sizes', async () => {
  const { app, page } = await launchFixture('standard');
  try {
    await app.evaluate(({ ipcMain }, { channel, settings }) => {
      ipcMain.removeHandler(channel);
      ipcMain.handle(channel, () => ({ ...settings, hasHackmdApiToken: false, hasAppearanceSettings: true,
        hasLocalVault: false, shouldShowHackmdOnboarding: true,
        hackmdCliConfig: { hasAccessToken: false, hasCustomEndpoint: false } }));
    }, { channel: ELECTRON_CHANNELS.settingsGet, settings: defaultSettings });
    await page.reload();
    await expect(page.locator('.cm-content')).toBeVisible();
    await page.keyboard.press(`${primary}+s`);
    await page.getByRole('button', { name: 'HackMD', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Connect HackMD', exact: true });
    for (const width of [1440, 400]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(dialog).toBeVisible();
      await expect.poll(() => dialog.evaluate(element => {
        const bounds = element.getBoundingClientRect();
        const targetWidth = Math.min(400, innerWidth - 32);
        return Math.abs(bounds.width - targetWidth)
          + Math.abs(bounds.left + bounds.width / 2 - innerWidth / 2);
      })).toBeLessThan(2);
    }
    await page.screenshot({ animations: 'disabled', path: test.info().outputPath('20-onboarding-compact.png') });
  } finally { await stopApp(app); }
});

test('classic horizontal scrollbars do not clip tabs and focus still scrolls the strip', async () => {
  const { app, page } = await launchFixture('standard', true);
  try {
    await switchWorkspace(page, 'Local Vault');
    for (const name of ['Alpha', 'Beta', 'Gamma']) {
      await page.locator('[data-folder-tree-kind="note"]').getByRole('treeitem', { name, exact: true }).click();
      await expect(page.getByRole('tab', { name: new RegExp(`^${name}(?:, .+)?$`) })).toHaveAttribute('aria-selected', 'true');
    }
    const strip = page.getByRole('navigation', { name: 'Open documents' });
    await strip.evaluate(element => { element.style.flex = 'none'; element.style.width = '240px'; });
    await page.addStyleTag({ content: 'nav[aria-label="Open documents"] { scrollbar-color: auto; } nav[aria-label="Open documents"]::-webkit-scrollbar { height: 14px; }' });
    await expect.poll(() => strip.evaluate(element => element.scrollWidth - element.clientWidth)).toBeGreaterThan(0);
    const tabs = strip.getByRole('tab');
    await tabs.first().focus();
    await page.keyboard.press('End');
    await expect(tabs.last()).toBeFocused();
    await expect.poll(() => strip.evaluate(element => element.scrollLeft)).toBeGreaterThan(0);
    await expect.poll(() => strip.evaluate(element => {
      const bounds = element.getBoundingClientRect();
      return Array.from(element.querySelectorAll('[data-tab-id]')).every(tab => {
        const rect = tab.getBoundingClientRect();
        return rect.height >= 24 && rect.top >= bounds.top && rect.bottom <= bounds.top + element.clientHeight;
      });
    })).toBe(true);
    await page.keyboard.press('Home');
    await expect(tabs.first()).toBeFocused();
    await expect.poll(() => strip.evaluate(element => element.scrollLeft)).toBe(0);
    await page.screenshot({ animations: 'disabled', path: test.info().outputPath('21-tabs-classic-scrollbar.png') });
  } finally { await stopApp(app); }
});

test('Settings search jumps to fields and held navigation stays inside the dialog', async () => {
  const { app, page } = await launchFixture('standard');
  try {
    await page.keyboard.press(`${primary}+,`);
    const dialog = page.getByRole('dialog', { name: 'Settings', exact: true });
    const search = dialog.getByRole('combobox', { name: 'Search settings', exact: true });
    await expect(search).toBeFocused();
    await dialog.getByLabel('Window title').fill('Unsaved fixture title');
    await search.fill('editor font');
    await page.screenshot({ animations: 'disabled', path: test.info().outputPath('23-settings-search.png') });
    await dialog.getByRole('option', { name: 'Editor font, Appearance', exact: true }).click();
    await expect(dialog.getByLabel('Editor font', { exact: true })).toBeFocused();
    await search.fill('primary');
    await search.press('Enter');
    await expect(dialog.locator('#theme-seed-primary')).toBeFocused();
    await expect(dialog.getByRole('button', { name: 'Customize colors', exact: true })).toHaveAttribute('aria-expanded', 'true');
    await search.fill('font');
    const options = dialog.getByRole('listbox', { name: 'Settings search results' }).getByRole('option');
    await search.press('ArrowDown');
    await search.press('ArrowDown');
    await expect(search).toBeFocused();
    await expect(options.nth(2)).toHaveAttribute('aria-selected', 'true');
    const third = (await options.nth(2).getAttribute('aria-label'))!.split(', ')[0];
    await search.press('Enter');
    await expect(dialog.getByLabel(third, { exact: true })).toBeFocused();
    await search.fill('window title');
    await search.press('Enter');
    await expect(dialog.getByLabel('Window title')).toBeFocused();
    await expect(dialog.getByLabel('Window title')).toHaveValue('Unsaved fixture title');
    await holdPrimary(page);
    const hints = page.locator('[data-navigation-hint]');
    await expect(page.locator('[data-navigation-hint="settings:general:settings-title"]')).toBeVisible();
    expect(await hints.evaluateAll(elements => elements.every(element => element.getAttribute('data-navigation-hint')?.startsWith('settings:')))).toBe(true);
    expect(await page.locator('[data-workspace-shortcut]').count()).toBe(0);
    await page.screenshot({ animations: 'disabled', path: test.info().outputPath('22-settings-navigation.png') });
    await useNavigationCode(page, 'settings:general:settings-title');
    await page.keyboard.up(primary);
    await expect(dialog.getByLabel('Window title')).toBeFocused();
    await dialog.getByRole('tab', { name: 'Appearance', exact: true }).click();
    await expect(dialog).toHaveAttribute('data-navigation-page', 'appearance');
    const preset = dialog.getByRole('combobox', { name: 'Theme preset' });
    // Changing the visible target set cancels a hold. Finish the tab's scroll/focus first.
    await preset.scrollIntoViewIfNeeded();
    await preset.focus();
    await expect(preset).toBeFocused();
    await holdPrimary(page);
    await expect(hints.first()).toBeVisible();
    await preset.evaluate(element => (element as HTMLElement).click());
    await expect(page.getByRole('listbox')).toBeVisible();
    await expect(page.locator('[data-keyboard-navigation-overlay]')).toHaveCount(0);
    await page.keyboard.up(primary);
    await page.keyboard.press('Escape');
  } finally { await stopApp(app); }
});

test('Hack Mode leaves only the active note, centered, until the same key is pressed again', async () => {
  const { app, page } = await launchFixture('vim', true);
  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openFixtureNote(page);
    await page.getByRole('button', { name: 'Pane actions', exact: true }).press('Enter');
    await page.getByRole('menuitem', { name: 'Split Right', exact: true }).press('Enter');
    await expect(page.locator('.cm-content')).toHaveCount(2);
    const sidebar = page.locator('#note-navigator-panel');
    const sidebarWidth = (await sidebar.boundingBox())!.width;
    const chrome = [
      page.getByRole('toolbar', { name: 'Application controls' }),
      page.getByRole('navigation', { name: 'Open documents' }),
      sidebar,
      page.getByRole('note', { name: 'Keys you can press' }),
      page.locator('[data-active-pane="true"] header').first(),
    ];

    const editor = page.locator('[data-active-pane="true"] .cm-content');
    await editor.click();
    await page.keyboard.press(`${primary}+.`);
    await expect(page.locator('.app-chrome')).toHaveAttribute('data-hack-mode', 'true');
    for (const part of chrome) await expect(part).toBeHidden();
    await expect(page.locator('section[data-document-pane-id]:visible')).toHaveCount(1);
    await expect(editor).toBeFocused();
    // The note's column is centered in the window.
    await expect.poll(async () => {
      const box = (await editor.boundingBox())!;
      return Math.abs(box.x + box.width / 2 - 720);
    }).toBeLessThan(16);
    // The top bar stays as a blank strip, so the window can still be dragged, and the accent line clears.
    await expect(page.locator('.app-topbar')).toBeVisible();
    await expect.poll(() => page.locator('[data-active-pane="true"]').evaluate(element => getComputedStyle(element, '::before').backgroundColor)).toBe('rgba(0, 0, 0, 0)');
    // Vim's Escape stays with the editor.
    await page.keyboard.press('Escape');
    await expect(page.locator('.app-chrome')).toHaveAttribute('data-hack-mode', 'true');
    await page.screenshot({ animations: 'disabled', path: test.info().outputPath('27-hack-mode.png') });

    await page.keyboard.press(`${primary}+.`);
    await expect(page.locator('.app-chrome')).not.toHaveAttribute('data-hack-mode');
    for (const part of chrome) await expect(part).toBeVisible();
    await expect(page.locator('section[data-document-pane-id]:visible')).toHaveCount(2);
    expect((await sidebar.boundingBox())!.width).toBe(sidebarWidth);

    // The leader menu enters it too, and toggling the sidebar leaves it with the sidebar shown. The
    // leader runs it here because vim keeps Ctrl+B, the sidebar key on Linux, for scrolling.
    await editor.click();
    const leader = async (keys: string) => {
      await page.keyboard.press(`${primary}+j`);
      await expect(page.getByRole('menu', { name: 'Commands' })).toBeVisible();
      for (const key of keys) await page.keyboard.press(key);
    };
    await leader('vf');
    await expect(page.locator('.app-chrome')).toHaveAttribute('data-hack-mode', 'true');
    await leader('vs');
    await expect(page.locator('.app-chrome')).not.toHaveAttribute('data-hack-mode');
    await expect(sidebar).toBeVisible();
  } finally {
    await stopApp(app);
  }
});

test('the workbench draws no divider lines at rest, and lines show only while content scrolls under them', async () => {
  const { app, page } = await launchFixture('standard', true);
  try {
    await page.setViewportSize({ width: 1100, height: 620 });
    await openFixtureNote(page);
    const pane = page.locator('[data-active-pane="true"]');
    const lineOpacity = (selector: string, pseudo: '::before' | '::after') => page.evaluate(([selector, pseudo]) => {
      const element = document.querySelector(selector);
      return element ? Number(getComputedStyle(element, pseudo).opacity) : -1;
    }, [selector, pseudo] as const);

    // The top bar, key hints and the sidebar's resize handle draw nothing of their own.
    const chrome = await page.evaluate(() => {
      const style = (selector: string) => getComputedStyle(document.querySelector(selector)!);
      return {
        topBar: style('.app-topbar').borderBottomWidth,
        keyHints: style('footer[aria-label="Keys you can press"]').borderTopWidth,
        sash: style('button[aria-label^="Resize sidebar"]').backgroundColor,
      };
    });
    expect(chrome).toEqual({ topBar: '0px', keyHints: '0px', sash: 'rgba(0, 0, 0, 0)' });

    // The note header shows its line only once the note scrolls under it.
    const header = '[data-active-pane="true"] header.scroll-edge-top';
    await expect.poll(() => lineOpacity(header, '::after')).toBe(0);
    await pane.locator('.cm-content').click();
    await page.keyboard.press(`${primary}+End`);
    await page.keyboard.insertText(Array.from({ length: 80 }, (_, line) => `Line ${line + 1}`).join('\n'));
    await expect.poll(() => lineOpacity(header, '::after')).toBe(1);
    await pane.locator('.cm-scroller').evaluate(scroller => scroller.scrollTo({ top: 0 }));
    await expect.poll(() => lineOpacity(header, '::after')).toBe(0);

    // The sidebar list fades at its edges while more content lies past the bottom.
    const list = page.locator('#note-navigator-panel .scroll-edges-source');
    const bottomFade = page.locator('#note-navigator-panel .edge-fade-bottom > *');
    await list.evaluate(element => element.scrollTo({ top: 0 }));
    await expect.poll(() => bottomFade.evaluate(element => Number(getComputedStyle(element).opacity))).toBeGreaterThan(0.5);
    await list.evaluate(element => element.scrollTo({ top: element.scrollHeight }));
    await expect.poll(() => bottomFade.evaluate(element => Number(getComputedStyle(element).opacity))).toBeLessThan(0.5);
    await page.screenshot({ animations: 'disabled', path: test.info().outputPath('29-fewer-dividers.png') });

    // Split panes are two cards a gap apart; only the active one is outlined in the accent color.
    await page.keyboard.press(`${primary}+\\`);
    const panes = page.locator('[data-document-pane-id][data-active-pane]');
    await expect(panes).toHaveCount(2);
    const layout = await panes.evaluateAll(elements => elements.map(element => ({
      left: element.getBoundingClientRect().left,
      right: element.getBoundingClientRect().right,
      active: element.getAttribute('data-active-pane') === 'true',
      border: getComputedStyle(element).borderTopColor,
      radius: getComputedStyle(element).borderTopLeftRadius,
    })));
    expect(layout[1].left - layout[0].right).toBeGreaterThanOrEqual(4);
    expect(layout.every(card => card.radius !== '0px')).toBe(true);
    expect(layout.filter(card => card.active)).toHaveLength(1);
    expect(layout[0].border).not.toBe(layout[1].border);
    await page.screenshot({ animations: 'disabled', path: test.info().outputPath('29-fewer-dividers-split.png') });
  } finally {
    await stopApp(app);
  }
});

test('nested splits and collapse preserve the surviving editor, selection, scroll and undo', async () => {
  const { app, page, vault } = await launchFixture('standard', true);
  try {
    const content = `# UI fixture\n\nTest note for layout checks.\n${Array.from({ length: 120 }, (_, index) => `Line ${index + 1}`).join('\n')}\n`;
    await writeFile(join(vault, 'UI fixture.md'), content);
    await page.setViewportSize({ width: 1600, height: 900 });
    await openFixtureNote(page);
    await page.keyboard.press(`${primary}+\\`);
    const panes = page.locator('section[data-document-pane-id]');
    await expect(panes).toHaveCount(2);
    const paneId = await page.locator('section[data-active-pane="true"]').getAttribute('data-document-pane-id');
    const pane = page.locator(`section[data-document-pane-id="${paneId}"]`);
    const editor = pane.locator('.cm-content');
    const scroller = pane.locator('.cm-scroller');
    const originalEditor = await editor.elementHandle();
    const marker = 'Unsaved before split';
    await editor.focus();
    await page.keyboard.press(`${primary}+End`);
    await page.keyboard.type(marker);
    await page.keyboard.press('Shift+Home');
    await expect.poll(() => page.evaluate(() => window.getSelection()?.toString())).toBe(marker);
    await page.evaluate(async () => {
      await document.fonts.ready;
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    });
    await expect.poll(() => scroller.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
    const readAnchor = () => scroller.evaluate(element => {
      const top = element.getBoundingClientRect().top;
      const line = Array.from(element.querySelectorAll('.cm-line')).find(line => line.getBoundingClientRect().bottom > top);
      if (!line) throw new Error('The editor has no visible line.');
      return { text: line.textContent, offset: line.getBoundingClientRect().top - top };
    });
    const anchorBefore = await readAnchor();

    await page.keyboard.press(`${primary}+Shift+\\`);
    await expect(panes).toHaveCount(3);
    expect(await editor.evaluate((element, original) => element === original, originalEditor)).toBe(true);
    // CodeMirror may remeasure line heights; preserve the reading position, rather than its estimated pixel total.
    await expect.poll(async () => (await readAnchor()).text).toBe(anchorBefore.text);
    await expect.poll(async () => (await readAnchor()).offset).toBeCloseTo(anchorBefore.offset, 0);
    // Return through the real focus command without a click changing the selection.
    await page.keyboard.press(`${primary}+j`);
    const menu = page.getByRole('menu', { name: 'Commands' });
    await expect(menu).toBeVisible();
    await page.keyboard.press('p');
    await page.keyboard.press('k');
    await expect(menu).toBeHidden();
    await expect(editor).toBeFocused();
    await page.keyboard.type('Replacement');
    await expect(editor).toContainText('Replacement');
    await expect(editor).not.toContainText(marker);
    await page.keyboard.press(`${primary}+z`);
    await expect(editor).toContainText(marker);
    await page.keyboard.press(`${primary}+z`);
    await expect(editor).not.toContainText(marker);
    await page.keyboard.press(`${primary}+Shift+z`);
    await expect(editor).toContainText(marker);

    // Closing the new pane folds its parent split back into the original row.
    const newPane = panes.last();
    await newPane.locator('.cm-content').focus();
    await expect(newPane).toHaveAttribute('data-active-pane', 'true');
    await page.keyboard.press(`${primary}+w`);
    const closePane = page.getByRole('alertdialog');
    if (await closePane.isVisible().catch(() => false)) {
      await closePane.getByRole('button', { name: 'Close Tab' }).click();
    }
    await expect(panes).toHaveCount(2);
    expect(await editor.evaluate((element, original) => element === original, originalEditor)).toBe(true);
    await expect(editor).toBeFocused();
    await page.keyboard.press(`${primary}+z`);
    await expect(editor).not.toContainText(marker);
    await page.keyboard.press(`${primary}+Shift+z`);
    await expect(editor).toContainText(marker);
  } finally {
    await stopApp(app);
  }
});

test('Equalize updates flat and nested pane sizes and keeps the saved layout in sync', async () => {
  const { app, page } = await launchFixture('standard', true);
  try {
    await page.setViewportSize({ width: 1600, height: 900 });
    await openFixtureNote(page);
    const panes = page.locator('section[data-document-pane-id]');
    const dimensions = () => panes.evaluateAll(elements => elements.map(element => {
      const { width, height } = element.getBoundingClientRect();
      return { width, height };
    }));
    const equalize = async () => {
      await page.keyboard.press(`${primary}+j`);
      await expect(page.getByRole('menu', { name: 'Commands' })).toBeVisible();
      await page.keyboard.press('p');
      await page.getByRole('menuitem', { name: /Equalize Pane Sizes/ }).click();
      await expect(page.getByRole('menu')).toBeHidden();
    };

    await page.keyboard.press(`${primary}+\\`);
    await expect(panes).toHaveCount(2);
    const horizontal = page.getByRole('separator', { name: /Resize document panes side by side/ });
    await horizontal.press('ArrowLeft');
    await expect.poll(async () => { const [a, b] = await dimensions(); return Math.abs(a.width - b.width); }).toBeGreaterThan(20);
    await equalize();
    await expect.poll(async () => { const [a, b] = await dimensions(); return Math.abs(a.width - b.width); }).toBeLessThan(2);

    await panes.last().locator('.cm-content').focus();
    await page.keyboard.press(`${primary}+Shift+\\`);
    await expect(panes).toHaveCount(3);
    // Resize one split with the pointer and the nested split with the keyboard.
    await horizontal.hover();
    const box = (await horizontal.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 2, { steps: 8 });
    await page.mouse.up();
    await page.getByRole('separator', { name: /Resize document panes stacked/ }).press('ArrowDown');
    await expect.poll(async () => {
      const [a, b, c] = await dimensions();
      return Math.abs(a.width - b.width) > 20 && Math.abs(b.height - c.height) > 20;
    }).toBe(true);

    const editors = page.locator('.cm-content');
    const originals = await editors.elementHandles();
    const editor = panes.last().locator('.cm-content');
    await editor.focus();
    await page.keyboard.press(`${primary}+End`);
    await page.keyboard.type(' equalize draft');
    // Hidden panes still need the new percentages when zoom is restored.
    await page.keyboard.press(`${primary}+Shift+Enter`);
    await expect(page.locator('section[data-document-pane-id]:visible')).toHaveCount(1);
    await equalize();
    await page.keyboard.press(`${primary}+Shift+Enter`);
    await expect(page.locator('section[data-document-pane-id]:visible')).toHaveCount(3);
    const expectEqualSizes = async () => expect.poll(async () => {
      const [a, b, c] = await dimensions();
      return Math.abs(a.width - b.width) < 2 && Math.abs(b.height - c.height) < 2;
    }).toBe(true);
    await expectEqualSizes();
    expect(await editors.evaluateAll((elements, previous) => elements.every((element, index) => element === previous[index]), originals)).toBe(true);
    await editor.focus();
    await page.keyboard.press(`${primary}+z`);
    await expect(editor).not.toContainText('equalize draft');
    await page.keyboard.press(`${primary}+Shift+z`);
    await expect(editor).toContainText('equalize draft');

    const tabId = (await panes.last().getAttribute('data-navigation-editor-id'))!;
    const savedState = () => page.evaluate(() => Object.entries(localStorage)
      .filter(([key]) => key.startsWith('hackdesk_note_workspace:local:'))
      .map(([, value]) => JSON.parse(value)).find(state => state.panes.length === 3));
    await expect.poll(async () => (await savedState())?.drafts[tabId]?.content).toContain('equalize draft');
    const saved = await savedState();
    expect(saved.layout).toMatchObject({ sizes: [50, 50], children: [{ type: 'pane' }, { type: 'split', sizes: [50, 50] }] });
    await page.reload();
    await expect(panes).toHaveCount(3);
    await expectEqualSizes();
    await expect(panes.last().locator('.cm-content')).toContainText('equalize draft');
    expect((await savedState()).layout).toEqual(saved.layout);
  } finally {
    await stopApp(app);
  }
});

test('panes split right and down, move by direction, and zoom without losing editor state', async () => {
  const { app, page } = await launchFixture('standard', true);
  try {
    await page.setViewportSize({ width: 1280, height: 800 });
    await openFixtureNote(page);
    // The menu closes before its command runs; callers also wait for the target pane's focus.
    const leader = async (keys: string) => {
      const menu = page.getByRole('menu', { name: 'Commands' });
      await page.keyboard.press(`${primary}+j`);
      await expect(menu).toBeVisible();
      for (const key of keys) await page.keyboard.press(key);
      await expect(menu).toBeHidden();
    };
    const panes = page.locator('section[data-document-pane-id]');
    const visiblePanes = page.locator('section[data-document-pane-id]:visible');
    const expectActivePane = async (paneId: string) => {
      const pane = page.locator(`section[data-document-pane-id="${paneId}"]`);
      await expect(pane).toHaveAttribute('data-active-pane', 'true');
      await expect(pane.locator('.cm-content')).toBeFocused();
    };

    // With one tab, next tab has nothing to do and says nothing.
    await page.locator('.cm-content').click();
    await page.keyboard.press(`${primary}+Alt+ArrowRight`);
    await expect(page.getByText('Open another tab first.')).toHaveCount(0);

    // Right, then down from the new pane: an L, with the left pane full height.
    await page.keyboard.press(`${primary}+\\`);
    await expect(panes).toHaveCount(2);
    await expect(page.locator('section[data-active-pane="true"] .cm-content')).toBeFocused();
    await page.keyboard.press(`${primary}+Shift+\\`);
    await expect(panes).toHaveCount(3);
    const boxes = await panes.evaluateAll(elements => elements.map(element => {
      const box = element.getBoundingClientRect();
      return { paneId: element.getAttribute('data-document-pane-id')!, x: Math.round(box.x), y: Math.round(box.y), height: Math.round(box.height) };
    }));
    const [left, top, bottom] = [...boxes].sort((a, b) => a.x - b.x || a.y - b.y);
    expect(top.x).toBe(bottom.x);
    expect(bottom.y).toBeGreaterThan(top.y);
    expect(left.height).toBeGreaterThan(top.height + bottom.height);
    await page.screenshot({ animations: 'disabled', path: test.info().outputPath('30-panes-l.png') });

    // The Pane group moves focus by where panes are.
    await expectActivePane(bottom.paneId);
    await leader('pk');
    await expectActivePane(top.paneId);
    await leader('ph');
    await expectActivePane(left.paneId);
    await leader('pl');
    await expectActivePane(top.paneId);
    await leader('pj');
    await expectActivePane(bottom.paneId);

    // Control+Command+arrows move by direction too, on macOS.
    if (process.platform === 'darwin') {
      await page.keyboard.press('Control+Meta+ArrowUp');
      await expectActivePane(top.paneId);
      await page.keyboard.press('Control+Meta+ArrowLeft');
      await expectActivePane(left.paneId);
      await page.keyboard.press('Control+Meta+ArrowDown');
      await expectActivePane(left.paneId);
    } else {
      await leader('ph');
      await expectActivePane(left.paneId);
    }
    // Next tab runs on past a pane's last tab into the next pane, in reading order. Elsewhere the
    // test uses next tab's Ctrl+Tab, since Alt there also reaches the window's menu bar.
    const nextTab = process.platform === 'darwin' ? 'Meta+Alt+ArrowRight' : 'Control+Tab';
    await page.keyboard.press(nextTab);
    await expectActivePane(top.paneId);
    await page.keyboard.press(nextTab);
    await expectActivePane(bottom.paneId);

    // Zoom fills the editor area with the active pane; the others come back as they were.
    const editor = page.locator('section[data-active-pane="true"] .cm-content');
    await editor.click();
    await page.keyboard.press(`${primary}+End`);
    await page.keyboard.type(' zoomed edit');
    await page.keyboard.press(`${primary}+Shift+Enter`);
    await expect(visiblePanes).toHaveCount(1);
    await expect(page.getByText(/^Pane zoomed · Press/)).toBeVisible();
    await page.screenshot({ animations: 'disabled', path: test.info().outputPath('30-panes-zoomed.png') });
    await page.keyboard.press(`${primary}+Shift+Enter`);
    await expect(visiblePanes).toHaveCount(3);
    await expect(editor).toContainText('zoomed edit');
    // The editor kept its undo history through zoom.
    await editor.click();
    await page.keyboard.press(`${primary}+z`);
    await expect(editor).not.toContainText('zoomed edit');

    // Each pane's header has a zoom button too.
    const header = page.locator('section[data-active-pane="true"] header');
    await header.hover();
    await header.getByRole('button', { name: 'Zoom pane' }).click();
    await expect(visiblePanes).toHaveCount(1);
    await page.locator('section[data-active-pane="true"] header').getByRole('button', { name: 'Restore panes' }).click();
    await expect(visiblePanes).toHaveCount(3);

    // Hack Mode leaves only the active pane of the nested split too.
    await page.keyboard.press(`${primary}+.`);
    await expect(visiblePanes).toHaveCount(1);
    await page.keyboard.press(`${primary}+.`);
    await expect(visiblePanes).toHaveCount(3);
  } finally {
    await stopApp(app);
  }
});

test('Note Details floats over the note and Escape returns to it', async () => {
  const { app, page } = await launchFixture('standard');
  try {
    await page.setViewportSize({ width: 1280, height: 760 });
    await openFixtureNote(page);
    const editor = page.locator('.cm-content');
    const editorWidth = async () => (await page.locator('.cm-editor').boundingBox())!.width;
    const editorLeft = async () => (await page.locator('.cm-editor').boundingBox())!.x;
    const before = await editorWidth();
    const left = await editorLeft();

    // Closed, it waits past the right edge. Nothing around it may scroll sideways, or taking focus
    // while it slides in would scroll the whole note to the left.
    const sidewaysScrollers = () => page.evaluate(() => {
      const toggle = document.querySelector('[data-active-pane="true"] [aria-controls][aria-label$="note details"]');
      const found: string[] = [];
      for (let element = document.getElementById(toggle?.getAttribute('aria-controls') ?? '')?.parentElement; element; element = element.parentElement) {
        element.scrollLeft = 40;
        if (element.scrollLeft > 0) found.push(`${element.tagName.toLowerCase()}.${element.className}`.slice(0, 80));
        element.scrollLeft = 0;
      }
      return found;
    });
    expect(await sidewaysScrollers()).toEqual([]);

    // Note Details opens from the leader menu over the editor, takes focus, and Escape returns to the note.
    await editor.click();
    await page.keyboard.press(`${primary}+j`);
    await expect(page.getByRole('menu', { name: 'Commands' })).toBeVisible();
    await page.keyboard.press('v');
    await page.keyboard.press('d');
    const details = page.getByRole('complementary', { name: 'Note details' });
    await expect(details).toBeVisible();
    await expect.poll(() => page.evaluate(() => Boolean(document.activeElement?.closest('[data-hackdesk-focus="inspector"]')))).toBe(true);
    expect(await editorWidth()).toBe(before);
    // Taking focus while it slides in does not scroll the note sideways.
    await page.waitForTimeout(300);
    expect(await editorLeft()).toBe(left);
    await page.screenshot({ animations: 'disabled', path: test.info().outputPath('25-note-details-overlay.png') });
    await page.keyboard.press('Escape');
    await expect(details).toBeHidden();
    await expect(editor).toBeFocused();
  } finally {
    await stopApp(app);
  }
});

test('the key hint bar follows focus, fades while typing, and can be hidden', async () => {
  const { app, page } = await launchFixture('standard');
  try {
    await openFixtureNote(page);
    const bar = page.getByRole('note', { name: 'Keys you can press' });
    const tree = page.locator('[data-folder-tree-kind="note"]').getByRole('treeitem', { name: 'UI fixture', exact: true });
    await tree.focus();
    await expect(tree).toBeFocused();
    await expect(bar).toHaveAttribute('data-key-hint-context', 'navigator');
    await expect(bar).toContainText('Open');
    await expect(bar).toContainText('New note');

    await page.locator('.cm-content').click();
    await expect(bar).toHaveAttribute('data-key-hint-context', 'editor');
    await page.keyboard.press('End');
    await page.keyboard.type(' typed');
    await expect(bar).toHaveAttribute('data-typing', 'true');
    await page.mouse.move(400, 300);
    await page.mouse.move(420, 320);
    await expect(bar).not.toHaveAttribute('data-typing');
    await expect(bar).toContainText('Open note');

    await bar.getByRole('button', { name: /Shortcuts/ }).click();
    await expect(page.getByRole('dialog', { name: 'Keyboard Shortcuts' })).toBeVisible();
    await page.keyboard.press('Escape');

    await page.keyboard.press(`${primary}+Shift+P`);
    await page.getByRole('combobox').fill('hide key hints');
    await page.getByRole('option', { name: /^Hide Key Hints/ }).click();
    await expect(bar).toHaveCount(0);
  } finally { await stopApp(app); }
});

test('the leader menu runs commands from a few letters with Space or the leader shortcut', async () => {
  const { app, page } = await launchFixture('standard');
  try {
    await openFixtureNote(page);
    const tree = page.locator('[data-folder-tree-kind="note"]').getByRole('treeitem', { name: 'UI fixture', exact: true });
    await tree.focus();

    // Space on a tree item opens the menu instead of the note.
    await page.keyboard.press('Space');
    const menu = page.getByRole('menu', { name: 'Commands' });
    await expect(menu).toBeVisible();
    await expect(page.getByRole('note', { name: 'Keys you can press' })).toContainText('Esc');
    await page.keyboard.press('t');
    await expect(page.getByRole('menu', { name: 'Commands › Tab' })).toBeVisible();
    await page.keyboard.press('Backspace');
    await expect(menu).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await expect(tree).toBeFocused();

    // In the editor, Space types and the leader shortcut opens the menu.
    await page.locator('.cm-content').click();
    await page.keyboard.press('End');
    await page.keyboard.type(' x');
    await expect(page.getByRole('menu')).toHaveCount(0);
    await expect(page.locator('.cm-content')).toContainText('x');
    await page.keyboard.press(`${primary}+j`);
    await page.keyboard.press('p');
    await page.keyboard.press('s');
    await expect(page.locator('[data-active-pane]')).toHaveCount(2);

    await page.keyboard.press(`${primary}+j`);
    await page.keyboard.press('v');
    await page.keyboard.press('k');
    await expect(page.getByRole('note', { name: 'Keys you can press' })).toHaveCount(0);
  } finally { await stopApp(app); }
});
