/**
 * Writes to Web Storage without throwing. Quota and unavailable-storage errors
 * return false so callers can keep in-memory state and report the failure.
 * Never evicts other keys to make room.
 */
export function trySetStorageItem(storage: Storage, key: string, value: string) {
  try {
    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}
