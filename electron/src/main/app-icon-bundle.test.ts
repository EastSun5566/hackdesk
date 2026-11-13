import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  app: { isPackaged: true, getPath: vi.fn(() => '/Applications/HackDesk.app/Contents/MacOS/HackDesk') },
  execFile: vi.fn(),
  writeLog: vi.fn(),
  stdout: 'ok',
}));

vi.mock('electron', () => ({ app: mocks.app }));
vi.mock('node:child_process', () => ({ execFile: mocks.execFile }));
vi.mock('./logging', () => ({ writeLog: mocks.writeLog }));

import { getAppBundlePath, persistBundleIcon, resetBundleIconForTesting } from './app-icon-bundle';

const originalPlatform = process.platform;

function setPlatform(platform: NodeJS.Platform) {
  Object.defineProperty(process, 'platform', { value: platform });
}

/** The [bundle, image] arguments of each osascript run. */
function scriptTargets() {
  return mocks.execFile.mock.calls.map(([, args]) => (args as string[]).slice(-2));
}

describe('persistBundleIcon', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetBundleIconForTesting();
    setPlatform('darwin');
    mocks.app.isPackaged = true;
    mocks.stdout = 'ok';
    mocks.execFile.mockImplementation((_file: string, _args: string[], callback: (error: Error | null, stdout: string) => void) => {
      callback(null, `${mocks.stdout}\n`);
    });
  });

  afterAll(() => setPlatform(originalPlatform));

  it('finds the bundle from the executable path', () => {
    expect(getAppBundlePath('/Applications/HackDesk.app/Contents/MacOS/HackDesk')).toBe('/Applications/HackDesk.app');
    expect(getAppBundlePath('/usr/lib/hackdesk/hackdesk')).toBeNull();
  });

  it('sets a chosen icon on the bundle, and clears it for the packaged icon', async () => {
    await persistBundleIcon('neon', '/res/neon.png');
    await persistBundleIcon('color-light', '/res/color-light.png');
    expect(scriptTargets()).toEqual([
      ['/Applications/HackDesk.app', '/res/neon.png'],
      ['/Applications/HackDesk.app', ''],
    ]);
  });

  it('skips a variant it already applied', async () => {
    await persistBundleIcon('neon', '/res/neon.png');
    await persistBundleIcon('neon', '/res/neon.png');
    expect(mocks.execFile).toHaveBeenCalledTimes(1);
  });

  it('leaves the bundle alone in development, off macOS, or without an image', async () => {
    mocks.app.isPackaged = false;
    await persistBundleIcon('neon', '/res/neon.png');
    mocks.app.isPackaged = true;
    setPlatform('win32');
    await persistBundleIcon('neon', '/res/neon.png');
    setPlatform('darwin');
    await persistBundleIcon('neon', undefined);
    expect(mocks.execFile).not.toHaveBeenCalled();
  });

  it('logs a failure instead of throwing, and retries the next change', async () => {
    mocks.stdout = 'failed';
    await persistBundleIcon('neon', '/res/neon.png');
    expect(mocks.writeLog).toHaveBeenCalledWith('main', expect.stringContaining('neon'), expect.any(Error), 'warn');
    mocks.stdout = 'ok';
    await persistBundleIcon('mint', '/res/mint.png');
    expect(mocks.execFile).toHaveBeenCalledTimes(2);
  });
});
