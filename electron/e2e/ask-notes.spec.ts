import { _electron as electron, expect, test } from '@playwright/test';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { createFakeCli } from '../src/main/ai/fake-cli-fixtures';
import { defaultSettings } from '../../src/lib/settings';
import { definedEnvironment } from './fixtures/environment';

const repoRoot = resolve(import.meta.dirname, '../..');
const primary = process.platform === 'darwin' ? 'Meta' : 'Control';

test('a question is answered from the vault notes it matches, citing them', async () => {
  const home = await mkdtemp(join(tmpdir(), 'hackdesk-ask-notes-'));
  const vault = join(home, 'vault');
  await mkdir(join(home, '.hackdesk'), { recursive: true });
  await mkdir(vault);
  await writeFile(join(vault, 'Weekly.md'), '# 產品週會\n\n議程略過。\n\n結論：離線閱讀先只支援開過的筆記。\n');
  await writeFile(join(vault, 'Recipe.md'), '# Recipe\n\nCurry tonight.\n');
  await writeFile(join(vault, 'Trip.md'), '# Trip\n\nTrain at nine.\n');
  // A configured command path keeps the real `claude` on the login shell's PATH out of the test.
  const fake = await createFakeCli('claude');
  await writeFile(join(home, '.hackdesk', 'settings.json'), JSON.stringify({
    ...defaultSettings,
    localVault: { path: vault },
    onboarding: { hackmdTokenSetupDeferred: true },
    ai: {
      ...defaultSettings.ai,
      providers: { ...defaultSettings.ai.providers, claude: { enabled: true, model: null, commandPath: fake.executable } },
      defaultProvider: 'claude',
    },
  }));
  const env = { ...definedEnvironment(process.env) };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.HACKDESK_ELECTRON_DEV_SERVER_URL;
  const app = await electron.launch({ args: [repoRoot, `--user-data-dir=${join(home, 'user-data')}`, `--hackdesk-home=${home}`], cwd: repoRoot, env });
  try {
    const page = await app.firstWindow();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect(page.getByRole('treeitem', { name: /^Weekly/ }).first()).toBeVisible();

    await page.keyboard.press(`${primary}+Shift+P`);
    await page.getByRole('combobox').fill('Ask Your Notes');
    await page.getByRole('option', { name: /^Ask Your Notes/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Ask Your Notes' });
    await dialog.getByRole('textbox', { name: 'Question' }).fill('上次離線閱讀的結論是什麼？');
    await dialog.getByRole('textbox', { name: 'Question' }).press('Enter');

    await expect(dialog.getByRole('list', { name: 'Sources' }).getByRole('button')).toHaveText([/Weekly/]);
    await expect(dialog).toContainText('Offline reading ships first [1].');
    const prompt = JSON.parse((await readFile(fake.promptsFile, 'utf8')).trim().split('\n').at(-1)!) as string;
    expect(prompt).toContain('<source id="1" title="Weekly">');
    expect(prompt).toContain('結論：離線閱讀先只支援開過的筆記。');
    expect(prompt).not.toContain('Curry tonight');
    // Tools stay off for questions too.
    const args = (await readFile(fake.argsFile, 'utf8')).trim().split('\n').map(line => JSON.parse(line) as string[]);
    const turnArgs = args.filter(list => list.includes('--system-prompt')).at(-1)!;
    expect(turnArgs).toEqual(expect.arrayContaining(['--tools', '', '--disallowedTools', '*']));
    expect(turnArgs[turnArgs.indexOf('--system-prompt') + 1]).toContain('Answer only from the text inside <source> tags');

    await dialog.getByRole('button', { name: 'Source 1: Weekly' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.locator('.cm-content')).toContainText('結論：離線閱讀先只支援開過的筆記。');
  } finally {
    await app.close();
  }
});
