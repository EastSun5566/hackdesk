import { app } from 'electron';
import { execFile } from 'node:child_process';
import { dirname } from 'node:path';

import { PACKAGED_APP_ICON, type AppIconVariantId } from '../../../src/lib/app-icons';
import { writeLog } from './logging';

/**
 * Sets (or, with no image, clears) the Finder icon of a file through NSWorkspace. Electron has no
 * API for it, so this runs through JavaScript for Automation instead of a native module.
 */
const SET_FILE_ICON_SCRIPT = `
ObjC.import('AppKit');
function run(argv) {
  const image = argv[1] ? $.NSImage.alloc.initWithContentsOfFile(argv[1]) : $();
  if (argv[1] && image.isNil()) return 'missing image';
  return $.NSWorkspace.sharedWorkspace.setIconForFileOptions(image, argv[0], 0) ? 'ok' : 'failed';
}`;

/** The running .app bundle: the executable sits at HackDesk.app/Contents/MacOS/HackDesk. */
export function getAppBundlePath(exePath = app.getPath('exe')) {
  const bundle = dirname(dirname(dirname(exePath)));
  return bundle.endsWith('.app') ? bundle : null;
}

function setFileIcon(path: string, imagePath: string | null) {
  return new Promise<void>((resolve, reject) => {
    execFile('osascript', ['-l', 'JavaScript', '-e', SET_FILE_ICON_SCRIPT, path, imagePath ?? ''], (error, stdout) => {
      const result = stdout.trim();
      if (error || result !== 'ok') reject(error ?? new Error(result || 'no result'));
      else resolve();
    });
  });
}

let lastVariant: AppIconVariantId | null = null;
let queue: Promise<void> = Promise.resolve();

/**
 * Gives the installed app bundle the chosen icon, so Finder, Launchpad and the Dock show it while
 * the app is closed too (macOS only). Picking the packaged icon again clears the custom one,
 * leaving the bundle as it was shipped. An update replaces the bundle, and the next launch
 * applies the icon again.
 *
 * The custom icon is an `Icon\r` file at the bundle root, outside the sealed `Contents`: the code
 * signature stays valid, though `codesign --strict` reports the extra file.
 */
export function persistBundleIcon(variant: AppIconVariantId, imagePath: string | undefined) {
  if (process.platform !== 'darwin' || !app.isPackaged || variant === lastVariant) return queue;
  const bundlePath = getAppBundlePath();
  if (!bundlePath) return queue;
  const image = variant === PACKAGED_APP_ICON ? null : imagePath ?? null;
  if (variant !== PACKAGED_APP_ICON && !image) return queue;
  lastVariant = variant;
  queue = queue
    .then(() => setFileIcon(bundlePath, image))
    .catch((error: unknown) => {
      // A bundle the user can't write to (an admin-installed app) keeps its packaged icon.
      writeLog('main', `could not set the app bundle icon to ${variant}`, error, 'warn');
    });
  return queue;
}

export function resetBundleIconForTesting() {
  lastVariant = null;
  queue = Promise.resolve();
}
