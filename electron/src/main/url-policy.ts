import { shell } from 'electron';

import type { OpenHackmdEditorInput } from '../../../src/lib/electron-api';
import { getHackmdNotePath } from '../../../src/lib/hackmd-path';
import { classifyExternalUrl } from './url-safety';

export async function openExternalUrl(url: string) {
  const classification = classifyExternalUrl(url);
  if (classification.type !== 'safe-external') {
    throw new Error(classification.reason);
  }

  await shell.openExternal(classification.url);
}

export async function openHackmdEditor(note: OpenHackmdEditorInput) {
  const path = getHackmdNotePath(note, true);
  await openExternalUrl(`https://hackmd.io${path}`);
}
