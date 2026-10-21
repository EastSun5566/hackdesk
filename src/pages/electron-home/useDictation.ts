import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import type { DictationHost } from '@/components/hackmd-live-preview/dictation/extension';
import type { MarkdownEditorDictation } from '@/components/markdown-editor-types';
import { toast } from '@/components/ui/toast';
import { getAiErrorMessage } from '@/lib/ai';
import { onDictationSettingsChanged } from '@/lib/dictation';
import { resolveWorkbenchShortcut } from '@/lib/electron-actions';
import { getHackDeskAPI } from '@/lib/electron-api';
import { matchShortcutConfig } from '@/lib/keyboard-shortcuts';
import type { DictationSettings } from '@/lib/settings';

import { ActionShortcutContext, useActionShortcut } from './ActionShortcutContext';

/** Owns dictation for one note: whether it is on, and the recording it started. */
export function useDictation(): MarkdownEditorDictation | null {
  const api = getHackDeskAPI();
  const shortcutLabel = useActionShortcut('dictate') ?? '';
  const { shortcuts, platform, characterShortcutsEnabled } = useContext(ActionShortcutContext);
  const isShortcut = useCallback((event: KeyboardEvent) => (
    matchShortcutConfig(resolveWorkbenchShortcut('dictate', shortcuts, characterShortcutsEnabled), event, platform)
  ), [characterShortcutsEnabled, platform, shortcuts]);
  const [settings, setSettings] = useState<DictationSettings | null>(null);
  const activeRef = useRef<string | null>(null);

  // Read when the note opens and again whenever Settings › Dictation saves.
  useEffect(() => {
    if (!api?.dictation) return undefined;
    let generation = 0;
    const load = () => {
      const current = ++generation;
      void api.settings.get().then((saved) => {
        if (current === generation && saved.dictation) setSettings(saved.dictation);
      }).catch(() => undefined);
    };
    load();
    const unsubscribe = onDictationSettingsChanged(load);
    return () => {
      generation += 1;
      unsubscribe();
    };
  }, [api]);

  // The editor cancels on close too; this covers a note switched while the editor is kept.
  useEffect(() => () => {
    const active = activeRef.current;
    activeRef.current = null;
    if (active) void api?.dictation?.cancel(active).catch(() => undefined);
  }, [api]);

  const start = useCallback<DictationHost['start']>((callbacks) => {
    const dictation = api?.dictation;
    if (!dictation || !settings) return null;
    if (!settings.enabled) {
      toast.error('Turn on dictation in Settings › Dictation first.');
      return null;
    }
    const requestId = crypto.randomUUID();
    activeRef.current = requestId;
    void dictation.start({ requestId, locale: settings.locale }, callbacks.onEvent).then(callbacks.onDone, (error: unknown) => {
      const message = getAiErrorMessage(error);
      toast.error(message);
      callbacks.onError(message);
    }).finally(() => {
      if (activeRef.current === requestId) activeRef.current = null;
    });
    return {
      stop: () => void dictation.stop(requestId).catch(() => undefined),
      cancel: () => void dictation.cancel(requestId).catch(() => undefined),
    };
  }, [api, settings]);

  return useMemo(() => (api?.dictation ? { start, shortcutLabel, isShortcut } : null), [api, isShortcut, shortcutLabel, start]);
}
