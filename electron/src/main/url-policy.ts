import { shell } from 'electron';

import type { OpenHackmdEditorInput } from '../../../src/lib/electron-api';
import { getHackmdNotePath } from '../../../src/lib/hackmd-path';

const SAFE_EXTERNAL_PROTOCOLS = new Set(['https:', 'http:', 'mailto:']);

export function classifyUrl(url: string): 'safe-external' | 'blocked' {
  try {
    const parsed = new URL(url);
    return SAFE_EXTERNAL_PROTOCOLS.has(parsed.protocol) ? 'safe-external' : 'blocked';
  } catch {
    return 'blocked';
  }
}

export async function openExternalUrl(url: string) {
  if (classifyUrl(url) !== 'safe-external') {
    throw new Error('Blocked unsupported URL scheme.');
  }

  await shell.openExternal(url);
}

export async function openHackmdEditor(note: OpenHackmdEditorInput) {
  const path = getHackmdNotePath(note, true);
  await openExternalUrl(`https://hackmd.io${path}`);
}
