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

async function launchFixture(editorMode: EditorMode = 'helix', navigationFixtures = false, recordKeyboard = false) {
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
    appearance: { ...defaultSettings.appearance, theme: 'dark' as const },
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
  await expect(page.getByTestId('sidebar-footer').getByRole('button', { name: /^Open settings for Fixture User/ })).toBeVisible();
  await expect(page.getByRole('treeitem', { name: 'UI fixture', exact: true })).toBeVisible();
  return { app, page };
}

async function stopApp(app: ElectronApplication, recordKeyboard = false) {
  if (recordKeyboard) {
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

// Hints cancel while the page is still changing, so hold the key again until they stay.
async function holdForHints(page: Page, target: Locator, ready = () => page.locator('[data-keyboard-navigation-overlay]').isVisible()) {
  await expect.poll(async () => {
    await page.keyboard.up(primary);
    await target.focus();
    await page.keyboard.down(primary);
    return ready();
  }).toBe(true);
}

async function openFixtureNote(page: Page) {
  await switchWorkspace(page, 'Local Vault');
  await page.locator('[data-folder-tree-kind="note"]').getByRole('treeitem', { name: 'UI fixture', exact: true }).click();
  await expect(page.locator('.cm-content')).toContainText('Test note for layout checks.');
}

async function expectInsetFocus(locator: Locator, container = false) {
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
    await page.locator('.cm-scroller').evaluate((element) => { element.scrollTop = element.scrollHeight; });
    await expect(lastLine).toHaveText('bottom and link');
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

test('workspace switcher rows, one-pixel boundaries and full-height Settings workbench', async () => {
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
    await expect(pin.locator('..')).toHaveCSS('opacity', '0');
    await expect(workspace).toContainText(process.platform === 'darwin' ? '⌘2' : 'Ctrl+2');
    await page.screenshot({ animations: 'disabled', path: testInfo.outputPath('10-switcher-idle.png') });
    await workspace.hover();
    await expect(drag).toHaveCSS('opacity', '1');
    await expect(pin.locator('..')).toHaveCSS('opacity', '1');
    await page.screenshot({ animations: 'disabled', path: testInfo.outputPath('02-switcher-controls.png') });
    await page.keyboard.press('Escape');
    await expect(list).toBeHidden();
    await expect(page.getByRole('button', { name: /^Switch workspace, current: / })).toBeFocused();

    // Reorder has its own fixture: dnd-kit briefly suppresses clicks after a drop.
    await openFixtureNote(page);
    const sash = page.getByRole('button', { name: /^Resize sidebar.*Current width/ });
    await expect(sash).toHaveCount(1);
    expect((await sash.boundingBox())!.width).toBe(1);
    const sidebar = page.locator('#note-navigator-panel');
    const sashBounds = (await sash.boundingBox())!;
    const initialWidth = (await sidebar.boundingBox())!.width;
    await page.mouse.move(sashBounds.x - 2, sashBounds.y + 100);
    await page.mouse.down();
    await page.mouse.move(sashBounds.x + 30, sashBounds.y + 100);
    await page.mouse.up();
    await expect.poll(async () => (await sidebar.boundingBox())!.width).toBeGreaterThan(initialWidth);
    await page.screenshot({ animations: 'disabled', path: testInfo.outputPath('03-panel-boundaries.png') });
    await page.keyboard.press(`${primary}+\\`);
    const separator = page.getByRole('separator', { name: /Resize document panes/ });
    await expect(separator).toBeVisible();
    expect((await separator.boundingBox())!.width).toBe(1);
    await separator.focus();
    await page.keyboard.press('ArrowLeft');
    await page.screenshot({ animations: 'disabled', path: testInfo.outputPath('04-document-panes.png') });

    await page.keyboard.press(`${primary}+,`);
    for (const height of [900, 660]) {
      await page.setViewportSize({ width: 1440, height });
      await expect(page.getByRole('dialog', { name: 'Settings' })).toHaveCSS('height', `${Math.min(760, height - 64)}px`);
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

test('one sidebar switches workspaces from its title, with Trash and Settings at the bottom', async () => {
  const { app, page } = await launchFixture('standard', true);
  try {
    await page.setViewportSize({ width: 1280, height: 760 });
    const trigger = page.getByRole('button', { name: /^Switch workspace, current: / });
    await expect(trigger).toHaveAccessibleName('Switch workspace, current: Local Vault');
    const footer = page.getByTestId('sidebar-footer');
    await expect(footer.getByRole('button', { name: 'Trash', exact: true })).toBeVisible();
    // Holding the key also shows which number opens which workspace, beside the sidebar. Hints and the
    // card cancel while the page still changes, so check them together in one look.
    const peekShortcut = process.platform === 'darwin' ? '⌘2' : 'Ctrl+2';
    await holdForHints(page, trigger, () => page.evaluate(({ name, shortcut }) => {
      const hints = document.querySelectorAll('[data-navigation-hint="workspace:switcher"], [data-navigation-hint="workspace:trash"]').length;
      const card = document.querySelector('[data-workspace-peek]');
      const row = card?.querySelectorAll('li')[1]?.textContent ?? '';
      const sidebar = document.getElementById('note-navigator-panel')!.getBoundingClientRect();
      return hints === 2 && row.includes(name) && row.includes(shortcut) && card!.getBoundingClientRect().left >= sidebar.right;
    }, { name: teamNames[0], shortcut: peekShortcut }));
    const peek = page.locator('[data-workspace-peek]');
    await page.screenshot({ animations: 'disabled', path: test.info().outputPath('24-workspace-peek.png') });
    await page.keyboard.up(primary);
    await expect(peek).toHaveCount(0);
    await switchWorkspace(page, `${teamNames[0]}, private`);
    await expect(trigger).toHaveAccessibleName(`Switch workspace, current: ${teamNames[0]}`);
    await page.keyboard.press(`${primary}+1`);
    await expect(trigger).toHaveAccessibleName('Switch workspace, current: My Workspace');

    await footer.getByRole('button', { name: 'Trash', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Trash' })).toBeVisible();
    await page.keyboard.press('Escape');
    await footer.getByRole('button', { name: /^Open settings for Fixture User/ }).click();
    await expect(page.getByRole('dialog', { name: 'Settings', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');

    await page.keyboard.press(`${primary}+b`);
    await expect(page.getByRole('button', { name: 'Expand sidebar', exact: true })).toBeVisible();
    await expect(trigger).toHaveCount(0);
    await page.keyboard.press(`${primary}+b`);
    await expect(trigger).toBeVisible();

    // The leader menu opens the switcher from the keyboard; arrows move and Enter switches.
    await page.keyboard.press(`${primary}+j`);
    await page.keyboard.press('g');
    await page.keyboard.press('w');
    const list = page.getByRole('dialog', { name: 'Workspaces' });
    await expect(list.getByRole('button', { name: 'My Workspace', exact: true })).toBeFocused();
    await page.screenshot({ animations: 'disabled', path: test.info().outputPath('23-workspace-switcher.png') });
    await page.keyboard.press('ArrowUp');
    await expect(list.getByRole('button', { name: 'History', exact: true })).toBeFocused();
    await page.keyboard.press('ArrowUp');
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
    await expect(strip.getByRole('tab', { name: /^Gamma(?:, .+)?$/ }).locator('xpath=..')).toHaveCSS('border-radius', '6px');
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
    const firstPaneTitle = await page.getByLabel('Note title', { exact: true }).first().inputValue();
    await dragTab('UI fixture', 'Gamma');
    await expect.poll(labels).toEqual(['UI fixture', 'Gamma']);
    expect(await page.getByLabel('Note title', { exact: true }).first().inputValue()).toBe(firstPaneTitle);
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
      const problems = await page.locator('[data-tree-children]').evaluateAll(lists => lists.flatMap(list => {
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
          if (index === items.length - 1) {
            const row = items[index].querySelector<HTMLElement>('[data-folder-tree-row-id]')!.getBoundingClientRect();
            if (Math.abs(bounds.bottom - (row.top + row.height / 2)) > 0.1) failures.push('Guide ends below the last row center');
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
      // Save uses real filesystem IPC and produces a real notification.
      await page.getByLabel('Note title', { exact: true }).fill(`UI fixture ${editorMode}`);
      await page.getByRole('button', { name: 'Save', exact: true }).click();
      const notification = page.getByRole('status').filter({ hasText: 'Note saved.' });
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
    // Confirmation is a native Electron message box, not a DOM alertdialog.
    // Exercise both IPC responses without leaving an unattended system sheet open.
    const mockConfirmation = async (confirmed: boolean) => app.evaluate(({ ipcMain }, { channel, confirmed }) => {
      const state = ipcMain as typeof ipcMain & { keyboardConfirmRequests: Array<{ title: string; destructive: boolean }> };
      state.keyboardConfirmRequests ??= [];
      ipcMain.removeHandler(channel);
      ipcMain.handle(channel, (_event, input) => {
        state.keyboardConfirmRequests.push(input);
        return { confirmed };
      });
    }, { channel: ELECTRON_CHANNELS.appConfirm, confirmed });
    await mockConfirmation(false);
    await close.focus();
    await close.press('Enter');
    await expect.poll(() => app.evaluate(({ ipcMain }) => (ipcMain as typeof ipcMain & { keyboardConfirmRequests: unknown[] }).keyboardConfirmRequests.length)).toBe(1);
    await expect(firstTab).toBeVisible();
    await expect(page.locator('.cm-content')).toContainText('Unsaved keyboard navigation draft');
    await mockConfirmation(true);
    await close.press('Enter');
    expect(await app.evaluate(({ ipcMain }) => (ipcMain as typeof ipcMain & { keyboardConfirmRequests: unknown[] }).keyboardConfirmRequests)).toEqual([
      expect.objectContaining({ title: 'Close Tab', destructive: true }),
      expect.objectContaining({ title: 'Close Tab', destructive: true }),
    ]);
    await expect(firstTab).toHaveCount(0);
    await expect(secondTab).toBeFocused();
    await page.screenshot({ path: test.info().outputPath('12-tab-keyboard-focus.png'), animations: 'disabled' });
  } finally { await stopApp(app, true); }
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
  } finally { await stopApp(app, true); }
});

for (const mode of ['standard', 'vim', 'helix', 'emacs', 'kakoune'] as const) {
  test(`F6 cycles both panes and restores focus in ${mode}`, async () => {
    const { app, page } = await launchFixture(mode, true, true);
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
      await stopApp(app, true);
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
    await settings.getByRole('checkbox', { name: 'Enable ?, / and Space outside text editing' }).uncheck();
    const filter = settings.getByPlaceholder('Search shortcuts', { exact: true });
    await filter.fill('Focus Note Finder');
    const binding = settings.getByRole('button', { name: 'Set shortcut for Focus Note Finder', exact: true });
    await binding.click(); await page.keyboard.press(`${primary}+e`);
    await settings.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(settings).toBeHidden();
    await expect(page.locator('[data-search-shortcut]')).toHaveText(process.platform === 'darwin' ? '⌘E' : 'Ctrl+E');
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
  const code = await page.locator(`[data-navigation-hint="${id}"]`).getAttribute('data-navigation-code');
  if (!code) throw new Error(`Missing navigation code for ${id}`);
  for (const letter of code) await page.keyboard.press(letter);
  await expect(hint).toHaveCount(0);
}

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
    await note.focus(); await page.keyboard.down(primary);
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
    await page.keyboard.down(primary);
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

    await note.focus(); await page.keyboard.down(primary);
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
    await page.keyboard.down(primary); await expect(overlay).toHaveCount(0); await page.keyboard.up(primary); await page.keyboard.press('Escape');

    await note.focus(); await page.keyboard.down(primary);
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await expect(overlay).toHaveCount(0); await page.keyboard.up(primary);
    await note.focus(); await page.keyboard.down(primary);
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
      await page.keyboard.down(primary);
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
      await page.keyboard.down(primary);
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
    await ui.focus(); await page.keyboard.down(primary);
    const betaRow = page.locator('[data-folder-tree-kind="note"]').filter({has:page.getByRole('treeitem',{name:'Beta',exact:true})});
    const betaId = await betaRow.getAttribute('data-folder-tree-row-id');
    await useNavigationCode(page, `tree:${betaId}`); await page.keyboard.up(primary);
    await expect(page.locator('.cm-content')).toContainText('# Beta');
    const uiTab = page.getByRole('tab', { name: /^UI fixture(?:, .+)?$/ });
    await uiTab.scrollIntoViewIfNeeded(); await uiTab.focus(); await page.keyboard.down(primary);
    await useNavigationCode(page, `tab:${await uiTab.getAttribute('data-navigation-tab-id')}`); await page.keyboard.up(primary);
    await expect(uiTab).toHaveAttribute('aria-selected','true');
    await expect(page.locator('.cm-content')).toContainText('Test note for layout checks.');
    // Horizontally clipped tabs receive no code; scrolling changes the target set and cancels the hold.
    const tabNav = page.getByRole('navigation', { name: 'Open documents', exact: true });
    await tabNav.evaluate(element => { element.style.flex = 'none'; element.style.width = '100px'; element.scrollLeft = 0; });
    await ui.focus(); await page.keyboard.down(primary);
    const tabHints = await page.locator('[data-navigation-hint^="tab:"]').count();
    expect(tabHints).toBeLessThan(await page.getByRole('tablist', { name: 'Open documents', exact: true }).getByRole('tab').count());
    await tabNav.evaluate(element => { element.scrollLeft = element.scrollWidth; });
    await expect(page.locator('[data-keyboard-navigation-overlay]')).toHaveCount(0);
    await page.keyboard.up(primary);
    await tabNav.evaluate(element => { element.style.flex = ''; element.style.width = ''; });
    await page.getByRole('treeitem',{name:'Projects',exact:true}).scrollIntoViewIfNeeded();
    const projects = page.getByRole('treeitem',{name:'Projects',exact:true});
    const folderId = await projects.evaluate(element=>element.closest('[data-folder-tree-row-id]')!.getAttribute('data-folder-tree-row-id'));
    await projects.focus(); await page.keyboard.down(primary);
    await useNavigationCode(page, `tree:${folderId}`); await page.keyboard.up(primary);
    await expect(projects).toBeFocused();
    await page.keyboard.press(`${primary}+Shift+n`);
    const createNoteDialog = page.getByRole('dialog', {name:'New Note',exact:true});
    await expect(createNoteDialog.getByText('Local Vault / Projects',{exact:true})).toBeVisible();
    await createNoteDialog.getByRole('button',{name:'Cancel',exact:true}).click();
    // Each hold fixes its visible target set; collapsing a folder cancels it.
    await projects.focus(); await page.keyboard.down(primary);
    await page.getByRole('button', {name:'Collapse Projects',exact:true}).evaluate(element => (element as HTMLButtonElement).click());
    await expect(page.locator('[data-keyboard-navigation-overlay]')).toHaveCount(0);
    await page.keyboard.up(primary);
    await projects.press('ArrowRight'); await page.keyboard.down(primary);
    await page.evaluate(()=>document.querySelector('[data-folder-tree-ignore-keyboard]')?.setAttribute('data-hackdesk-dragging','true'));
    await expect(page.locator('[data-keyboard-navigation-overlay]')).toHaveCount(0);
    await page.keyboard.up(primary);
    await page.evaluate(()=>document.querySelector('[data-hackdesk-dragging]')?.removeAttribute('data-hackdesk-dragging'));
    for (const mode of ['light', 'dark'] as const) {
      await page.evaluate(theme => {
        for (const [name, value] of Object.entries(theme)) document.documentElement.style.setProperty(name, value);
      }, resolveHackDeskTheme({ presetId: 'hackmd-neo', mode }));
      await projects.focus();
      await page.keyboard.down(primary);
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
    await expect(settings).toBeHidden(); await note.focus(); await page.keyboard.down(primary);
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
    const dialog = page.getByRole('dialog', { name: 'Connect HackMD', exact: true });
    for (const width of [1440, 400]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(dialog).toBeVisible();
      await expect.poll(() => dialog.evaluate(element => {
        const bounds = element.getBoundingClientRect();
        return Math.abs(bounds.width - Math.min(440, innerWidth - 32))
          + Math.abs(bounds.left + bounds.width / 2 - innerWidth / 2);
      })).toBeLessThan(1);
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
    await expect(dialog.getByRole('button', { name: 'Customize Colors', exact: true })).toHaveAttribute('aria-expanded', 'true');
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
    await page.keyboard.down(primary);
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
    await page.keyboard.down(primary);
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

test('Note Details floats over the note and Escape returns to it', async () => {
  const { app, page } = await launchFixture('standard');
  try {
    await page.setViewportSize({ width: 1280, height: 760 });
    await openFixtureNote(page);
    const editor = page.locator('.cm-content');
    const editorWidth = async () => (await page.locator('.cm-editor').boundingBox())!.width;
    const before = await editorWidth();

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
    await page.locator('[data-folder-tree-kind="note"]').getByRole('treeitem', { name: 'UI fixture', exact: true }).focus();
    await expect(bar).toContainText('Open');
    await expect(bar).toContainText('New note');

    await page.locator('.cm-content').click();
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
    await page.keyboard.press('t');
    await page.keyboard.press('s');
    await expect(page.locator('[data-active-pane]')).toHaveCount(2);

    await page.keyboard.press(`${primary}+j`);
    await page.keyboard.press('v');
    await page.keyboard.press('k');
    await expect(page.getByRole('note', { name: 'Keys you can press' })).toHaveCount(0);
  } finally { await stopApp(app); }
});
