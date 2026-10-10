import { _electron as electron, expect, test, type ElectronApplication, type Locator, type Page } from '@playwright/test';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

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
  const env = { ...process.env };
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
  await expect(page.getByRole('button', { name: `${teamNames[0]}, private`, exact: true })).toBeVisible();
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

async function openFixtureNote(page: Page) {
  await page.getByRole('button', { name: 'Local Vault', exact: true }).click();
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

test('rail controls, one-pixel boundaries and full-height Settings workbench', async () => {
  const testInfo = test.info();
  const { app, page } = await launchFixture();
  try {
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1440, 900));
    await page.getByRole('button', { name: /^Resize workspace sidebar/ }).focus();
    await page.keyboard.press('Home');
    await expect.poll(async () => (await page.getByRole('complementary', { name: 'Workspace switcher' }).boundingBox())!.width).toBe(192);
    const workspace = page.getByRole('button', { name: `${teamNames[0]}, private`, exact: true });
    const drag = page.getByRole('button', { name: `Reorder ${teamNames[0]}`, exact: true });
    const pin = page.getByRole('button', { name: `Unpin ${teamNames[0]}`, exact: true });
    await page.getByRole('button', { name: 'My Workspace', exact: true }).focus();
    await page.mouse.move(900, 100);
    const rowBounds = (await workspace.locator('..').boundingBox())!;
    expect((await workspace.boundingBox())!.width).toBe(rowBounds.width);
    await expect(drag).toHaveCSS('opacity', '0');
    await expect(pin.locator('..')).toHaveCSS('opacity', '0');
    await page.screenshot({ animations: 'disabled', path: testInfo.outputPath('10-rail-idle.png') });
    await workspace.click();
    await workspace.hover();
    await drag.focus();
    const before = await workspace.boundingBox();
    await page.keyboard.down(primary);
    await expect(drag).toHaveCSS('opacity', '1');
    const hint = workspace.locator('..').locator('[data-workspace-shortcut]');
    const hintBounds = await hint.boundingBox();
    const dragBounds = await drag.boundingBox();
    const pinBounds = await pin.boundingBox();
    expect(dragBounds!.x + dragBounds!.width).toBeLessThanOrEqual(hintBounds!.x);
    expect(hintBounds!.x + hintBounds!.width).toBeLessThanOrEqual(pinBounds!.x);
    const maskBounds = (await pin.locator('..').boundingBox())!;
    expect(maskBounds.x).toBeLessThanOrEqual(hintBounds!.x);
    expect(maskBounds.x + maskBounds.width).toBeGreaterThanOrEqual(pinBounds!.x + pinBounds!.width);
    expect(await workspace.boundingBox()).toEqual(before);
    await page.screenshot({ animations: 'disabled', path: testInfo.outputPath('02-rail-controls.png') });
    await page.keyboard.up(primary);

    // Both sensors still reorder after moving the handle into normal layout.
    await drag.focus();
    // The keyboard sensor attaches its document listener in the next task.
    await drag.press('Space', { delay: 50 });
    await expect(drag).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('ArrowDown', { delay: 50 });
    await expect.poll(() => drag.locator('xpath=ancestor::li').evaluate(element => element.style.transform)).toMatch(/translate3d\(0px, (?!0px)[\d.]+px/);
    await expect(drag).toBeFocused();
    await page.keyboard.press('Space');
    await expect(drag).not.toHaveAttribute('aria-pressed', 'true');
    const teamList = page.getByTestId('workspace-rail-team-list');
    await expect(teamList.getByRole('listitem').first()).toContainText('Second Team');
    const first = await page.getByRole('button', { name: 'Reorder Second Team' }).boundingBox();
    const last = await drag.boundingBox();
    await page.mouse.move(first!.x + first!.width / 2, first!.y + first!.height / 2);
    await page.mouse.down();
    await page.mouse.move(last!.x + last!.width / 2, last!.y + last!.height / 2, { steps: 10 });
    await page.mouse.up();
    await expect(teamList.getByRole('listitem').first()).toContainText(teamNames[0]);

    while (await page.getByRole('button', { name: 'Close notification', exact: true }).count()) {
      await page.getByRole('button', { name: 'Close notification', exact: true }).first().click();
    }
    await openFixtureNote(page);
    const sashes = page.getByRole('button', { name: /^Resize .*Current width/ });
    expect(await sashes.count()).toBe(2);
    for (const sash of await sashes.all()) expect((await sash.boundingBox())!.width).toBe(1);
    const rail = page.getByRole('complementary', { name: 'Workspace switcher' });
    await expect(rail).toHaveCSS('border-right-width', '0px');
    await page.keyboard.press(`${primary}+b`);
    await expect(rail).toHaveCSS('border-right-width', '1px');
    await expect(page.getByRole('button', { name: /^Resize workspace sidebar/ })).toHaveCount(0);
    await page.keyboard.press(`${primary}+b`);
    const railSash = sashes.first();
    const sashBounds = (await railSash.boundingBox())!;
    const initialRailWidth = (await page.getByRole('complementary', { name: 'Workspace switcher' }).boundingBox())!.width;
    await page.mouse.move(sashBounds.x - 2, sashBounds.y + 100);
    await page.mouse.down();
    await page.mouse.move(sashBounds.x + 30, sashBounds.y + 100);
    await page.mouse.up();
    await expect.poll(async () => (await page.getByRole('complementary', { name: 'Workspace switcher' }).boundingBox())!.width).toBeGreaterThan(initialRailWidth);
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
      const sidebar = page.getByRole('tablist', { name: 'Settings sections' });
      const assertFullHeight = async () => {
        await expect.poll(() => sidebar.evaluate((element) => {
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

test('tab drag, keyboard actions, persistence and pane isolation', async () => {
  const { app, page } = await launchFixture('standard', true);
  const testInfo = test.info();
  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.getByRole('button', { name: 'Local Vault', exact: true }).click();
    const openNote = async (name: string) => {
      await page.locator('[data-folder-tree-kind="note"]').getByRole('treeitem', { name, exact: true }).click();
      await expect(page.getByRole('tab', { name: `Select ${name} tab`, exact: true })).toHaveAttribute('aria-selected', 'true');
    };
    const strip = page.getByRole('navigation', { name: 'Open documents' });
    const labels = () => strip.getByRole('tab', { name: /^Select .* tab$/ }).evaluateAll(elements => elements.map(element => element.getAttribute('aria-label')));
    const dragTab = async (from: string, to: string, cancel = false) => {
      const source = (await strip.getByRole('tab', { name: `Select ${from} tab`, exact: true }).boundingBox())!;
      const target = (await strip.getByRole('tab', { name: `Select ${to} tab`, exact: true }).boundingBox())!;
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
    await strip.getByRole('tab', { name: 'Select Alpha tab', exact: true }).hover();
    await expect(closeInactiveTab).toHaveCSS('opacity', '1');
    await dragTab('Alpha', 'Gamma');
    await expect.poll(labels).toEqual(['Select Beta tab', 'Select Gamma tab', 'Select Alpha tab']);
    await expect(strip.getByRole('tab', { name: 'Select Gamma tab' })).toHaveAttribute('aria-selected', 'true');
    await dragTab('Alpha', 'Beta', true);
    await expect.poll(labels).toEqual(['Select Beta tab', 'Select Gamma tab', 'Select Alpha tab']);
    await expect(strip.getByRole('tab', { name: 'Select Gamma tab' })).toHaveAttribute('aria-selected', 'true');

    // Verify drag persistence before testing keyboard actions independently.
    // dnd-kit briefly suppresses native clicks after a pointer drag ends,
    // including the click generated by an immediate Enter keypress.
    await expect.poll(() => page.evaluate(() => Object.entries(localStorage).some(([key, value]) => key.startsWith('hackdesk_note_workspace:') && JSON.parse(value).panes[0].tabIds.map((id: string) => JSON.parse(value).tabs[id].title).join(',') === 'Beta,Gamma,Alpha'))).toBe(true);
    await page.reload();
    await expect.poll(labels).toEqual(['Select Beta tab', 'Select Gamma tab', 'Select Alpha tab']);
    await expect(page.locator('.cm-content')).toContainText('# Gamma');
    await page.getByRole('button', { name: 'Pane actions' }).press('Enter');
    await page.getByRole('menuitem', { name: 'Move Tab Left', exact: true }).press('Enter');
    await expect.poll(labels).toEqual(['Select Gamma tab', 'Select Beta tab', 'Select Alpha tab']);
    await page.getByRole('button', { name: 'Pane actions' }).click();
    await expect(page.getByRole('menuitem', { name: 'Move Tab Left', exact: true })).toHaveAttribute('aria-disabled', 'true');
    await page.keyboard.press('Escape');
    await expect.poll(() => page.evaluate(() => Object.entries(localStorage).some(([key, value]) => key.startsWith('hackdesk_note_workspace:') && JSON.parse(value).panes[0].tabIds.map((id: string) => JSON.parse(value).tabs[id].title).join(',') === 'Gamma,Beta,Alpha'))).toBe(true);
    await page.reload();
    await expect.poll(labels).toEqual(['Select Gamma tab', 'Select Beta tab', 'Select Alpha tab']);
    await expect(strip.getByRole('tab', { name: 'Select Gamma tab' })).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press(`${primary}+\\`);
    await expect(page.getByRole('separator', { name: /Resize document panes/ })).toBeVisible();
    await openNote('UI fixture');
    const firstPaneTitle = await page.getByLabel('Note title', { exact: true }).first().inputValue();
    await dragTab('UI fixture', 'Gamma');
    await expect.poll(labels).toEqual(['Select UI fixture tab', 'Select Gamma tab']);
    expect(await page.getByLabel('Note title', { exact: true }).first().inputValue()).toBe(firstPaneTitle);
    await page.screenshot({ animations: 'disabled', path: testInfo.outputPath('08-tab-reorder.png') });
    await strip.getByRole('button', { name: 'Close Gamma', exact: true }).click();
    await expect.poll(labels).toEqual(['Select UI fixture tab']);
    await expect(strip.getByRole('tab', { name: 'Select UI fixture tab' })).toHaveAttribute('aria-selected', 'true');
    // A long strip must scroll while dragging towards its edge.
    for (let i = 0; i < 8; i++) await openNote(`Long document title number ${i}`);
    await strip.evaluate(element => { element.scrollLeft = 0; });
    const longTab = strip.getByRole('tab', { name: 'Select Long document title number 0 tab' });
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
    await page.getByRole('button', { name: 'Local Vault', exact: true }).click();
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
      await page.getByRole('button', { name: 'My Workspace', exact: true }).click();
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
    await page.getByRole('button', { name: 'Local Vault', exact: true }).click();
    const tree = page.getByRole('tree', { name: 'Folders and notes' });
    const alpha = tree.getByRole('treeitem', { name: 'Alpha', exact: true });
    const beta = tree.getByRole('treeitem', { name: 'Beta', exact: true });
    await alpha.click();
    await beta.focus();
    await expect(page.locator('.cm-content')).toContainText('# Alpha');
    await beta.press('Enter');
    await expect(page.locator('.cm-content')).toContainText('# Beta');
    const firstTab = page.getByRole('tab', { name: 'Select Alpha tab', exact: true });
    const secondTab = page.getByRole('tab', { name: 'Select Beta tab', exact: true });
    await secondTab.focus();
    await secondTab.press('ArrowLeft');
    await expect(firstTab).toBeFocused();
    await expect(secondTab).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('.cm-content')).toContainText('# Beta');
    await firstTab.press('Space');
    await expect(firstTab).toHaveAttribute('aria-selected', 'true');
    const panelId = await firstTab.getAttribute('aria-controls');
    const panel = page.getByRole('tabpanel');
    await expect(panel).toHaveAttribute('id', panelId!);
    await expect(panel).toHaveAttribute('aria-labelledby', (await firstTab.getAttribute('id'))!);
    await expect(firstTab).toHaveAccessibleDescription('Saved');

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
    await expect(firstTab).toHaveAccessibleDescription('Unsaved');
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
    await page.getByRole('button', { name: 'My Workspace', exact: true }).click();
    await page.getByRole('button', { name: 'Local Vault', exact: true }).click();
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
      const local = page.getByRole('button', { name: 'Local Vault', exact: true });
      await local.focus();
      await page.keyboard.press('F6');
      await expect(page.getByRole('treeitem', { name: 'UI fixture', exact: true })).toBeFocused();
      await page.keyboard.press('F6');
      await expect(page.getByRole('tab', { name: 'Select UI fixture tab', exact: true })).toBeFocused();
      await page.keyboard.press('F6');
      await expect(editors.first()).toBeFocused();
      await expect(editors.first().locator('xpath=ancestor::section[@data-active-pane][1]')).toHaveAttribute('data-active-pane', 'true');
      await page.keyboard.press('F6');
      await expect(editors.last()).toBeFocused();
      await page.keyboard.press('F6');
      await expect(local).toBeFocused();
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
      await page.getByRole('button', { name: 'Collapse workspace sidebar', exact: true }).click();
      await page.getByRole('toolbar', { name: 'Application controls', exact: true }).getByRole('button', { name: 'Collapse note navigator', exact: true }).click();
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
    await expect(help.getByRole('button', { name: 'Current Region: Navigator' })).toHaveAttribute('aria-pressed', 'true');
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
    await settings.getByRole('checkbox', { name: 'Enable ? and / outside text editing' }).uncheck();
    const filter = settings.getByPlaceholder('Search shortcuts', { exact: true });
    await filter.fill('Focus Note Finder');
    const binding = settings.getByRole('button', { name: 'Set shortcut for Focus Note Finder', exact: true });
    await binding.click(); await page.keyboard.press(`${primary}+j`);
    await settings.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(settings).toBeHidden();
    await expect(page.locator('[data-search-shortcut]')).toHaveText(process.platform === 'darwin' ? '⌘J' : 'Ctrl+J');
    await note.focus(); await page.keyboard.press('?');
    await expect(help).toHaveCount(0);
    await page.keyboard.press('/'); await expect(search).not.toBeFocused();
    await page.keyboard.press(`${primary}+j`); await expect(search).toBeFocused();
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
      function expectNoAccelerator(accelerator: string | undefined) { if (accelerator) throw new Error('Context key registered natively'); }
    });
    await expect(help).toBeVisible();
    await expect(help.getByRole('button', { name: 'Current Region: Editor' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('.cm-content')).toBeFocused();
    await page.keyboard.press(`${primary}+k`);
    await page.getByRole('combobox', { name: 'Search notes, folders, and commands' }).fill('Next Workbench Region');
    await page.getByRole('option', { name: /^Next Workbench Region / }).click();
    await expect(page.getByRole('button', { name: 'Local Vault', exact: true })).toBeFocused();
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
    await note.focus();
    await page.keyboard.down(primary);
    const overlay = page.locator('[data-keyboard-navigation-overlay]');
    await expect(overlay).toBeVisible();
    await expect(page.locator('[data-navigation-unavailable]')).toHaveCount(0);
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
    await expect(page.getByRole('toolbar', { name: 'Application controls' }).getByRole('button', { name: 'Collapse note navigator', exact: true })).toBeFocused();
    expect((await navigator.boundingBox())!.width).toBe(width);
    await page.keyboard.up(primary); await page.keyboard.press('Enter');
    await expect(page.getByRole('button', { name: 'Expand note navigator', exact: true })).toBeVisible();
    await page.keyboard.press(`${primary}+Alt+b`);
    await expect(page.getByRole('toolbar', { name: 'Application controls' }).getByRole('button', { name: 'Collapse note navigator', exact: true })).toBeVisible();

    await note.focus(); await page.keyboard.down(primary);
    await page.keyboard.press('b'); await page.keyboard.up(primary);
    await expect(page.getByRole('button', { name: 'Expand workspace sidebar', exact: true })).toBeVisible();
    await page.keyboard.press(`${primary}+b`);
    await expect(page.getByRole('button', { name: 'Collapse workspace sidebar', exact: true })).toBeVisible();
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
      const unavailable = page.locator('[data-navigation-unavailable]');
      if (await unavailable.count()) {
        await expect(page.locator('[data-navigation-code]:not([data-navigation-code=""])')).toHaveCount(0);
      } else {
        const id = await page.locator('[data-navigation-hint^="editor:"]').first().getAttribute('data-navigation-hint');
        await useNavigationCode(page, id!);
        await expect(editors.first()).toBeFocused();
      }
      await page.keyboard.up(primary);
      // Navigation from a Workbench region remains available even if the active editor exhausts safe keys.
      await page.getByRole('button', { name: 'Local Vault', exact: true }).focus();
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
    const uiTab = page.getByRole('tab', { name: 'Select UI fixture tab', exact: true });
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
    await page.keyboard.press(`${primary}+j`);
    await settings.getByRole('button',{name:'Save',exact:true}).click();
    await expect(settings).toBeHidden(); await note.focus(); await page.keyboard.down(primary);
    const codes = await page.locator('[data-navigation-code]').evaluateAll(elements=>elements.map(element=>element.getAttribute('data-navigation-code')));
    expect(codes.every(code=>!code?.includes('j'))).toBe(true);
    await expect(page.locator('[data-navigation-hint="finder"]')).toHaveAttribute('data-navigation-code', /^[a-z]{2,3}$/);
    await page.keyboard.up(primary);
  } finally { await stopApp(app); }
});
