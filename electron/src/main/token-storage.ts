import { safeStorage } from 'electron';

export type EncryptedHackmdToken = { version: 1; ciphertext: string };

function requireSecureStorage() {
  // The synchronous provider exposes Linux's insecure basic_text fallback explicitly.
  const backend = process.platform === 'linux' ? safeStorage.getSelectedStorageBackend() : undefined;
  if (!safeStorage.isEncryptionAvailable() || backend === 'basic_text' || backend === 'unknown') {
    throw new Error('Secure token storage is unavailable. Unlock your system keyring and try again.');
  }
}

export function encryptHackmdToken(token: string): EncryptedHackmdToken {
  requireSecureStorage();
  try {
    return { version: 1, ciphertext: safeStorage.encryptString(token).toString('base64') };
  } catch {
    throw new Error('Could not protect the HackMD token. Your saved settings have not changed.');
  }
}

export function decryptHackmdToken(value: unknown): string {
  requireSecureStorage();
  try {
    if (!value || typeof value !== 'object' || !('version' in value) || value.version !== 1
      || !('ciphertext' in value) || typeof value.ciphertext !== 'string' || !value.ciphertext) {
      throw new Error('Invalid token envelope.');
    }
    const buffer = Buffer.from(value.ciphertext, 'base64');
    if (buffer.toString('base64') !== value.ciphertext) throw new Error('Invalid token encoding.');
    return safeStorage.decryptString(buffer);
  } catch {
    throw new Error('Could not unlock the saved HackMD token. Unlock your system keyring or reconnect in Settings.');
  }
}
