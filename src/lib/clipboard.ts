import type { HackDeskElectronAPI } from './electron-api';

export async function writeClipboardText(api: HackDeskElectronAPI | undefined, text: string) {
  if (api?.app.writeClipboardText) {
    await api.app.writeClipboardText(text);
    return;
  }

  if (!navigator.clipboard?.writeText) {
    throw new Error('Clipboard is unavailable.');
  }

  await navigator.clipboard.writeText(text);
}
