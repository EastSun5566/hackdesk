/** What Settings › Dictation and the editor need to know before recording. */
export type DictationStatus = {
  available: boolean;
  /** Why dictation cannot run here, when it cannot. */
  message: string | null;
  /** BCP 47 tags, such as zh-TW and en-US. */
  locales: string[];
  installed: string[];
  /** The best match for the system's preferred languages. */
  suggested: string | null;
};

/** Streamed while a recording runs, or while a language downloads. */
export type DictationEvent =
  | { type: 'ready' }
  | { type: 'level'; value: number }
  /** The words still being decided, after everything final so far; replaces the previous one. */
  | { type: 'volatile'; text: string }
  /** Settled text, appended to what came before. */
  | { type: 'final'; text: string }
  | { type: 'progress'; fraction: number };

export type DictationEventMessage = { requestId: string; event: DictationEvent };

export type DictationStartInput = { requestId: string; locale: string | null };

export type DictationInstallInput = { requestId: string; locale: string };

export const MAX_DICTATION_LOCALE_LENGTH = 35;

const DICTATION_SETTINGS_CHANGED_EVENT = 'hackdesk:dictation-settings-changed';

/** Settings › Dictation saves through IPC on its own; open notes listen for this to pick up the change. */
export function notifyDictationSettingsChanged() {
  window.dispatchEvent(new Event(DICTATION_SETTINGS_CHANGED_EVENT));
}

export function onDictationSettingsChanged(listener: () => void) {
  window.addEventListener(DICTATION_SETTINGS_CHANGED_EVENT, listener);
  return () => window.removeEventListener(DICTATION_SETTINGS_CHANGED_EVENT, listener);
}
