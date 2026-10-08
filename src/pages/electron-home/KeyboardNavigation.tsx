import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { ShortcutOverrides } from '@/lib/keyboard-shortcuts';
import { isMacPlatform } from '@/lib/keyboard-shortcuts';
import { allocateNavigationCodes, collectNavigationTargets, navigationHintPositions, navigationRect, navigateToTarget, safeNavigationLetters, type NavigationHint } from './keyboard-navigation';
import { hasWorkbenchPopup } from './workbench-keyboard-context';

import { NavigationHintsContext } from './KeyboardNavigationContext';
type HintState = { context: symbol | null; held: boolean; hints: NavigationHint[]; prefix: string; reason: string };
const EMPTY: HintState = { context: null, held: false, hints: [], prefix: '', reason: '' };

type NavigationProps = { workspaceKey: string | null; shortcuts?: ShortcutOverrides; platform: string; characterEnabled: boolean; children: ReactNode };
export function KeyboardNavigation({ workspaceKey, shortcuts: configuredShortcuts, platform, characterEnabled, children }: NavigationProps) {
  const codesByWorkspace = useRef(new Map<string, Map<string, string>>());
  const signature = JSON.stringify(configuredShortcuts ?? {});
  const shortcuts = useMemo<ShortcutOverrides>(() => JSON.parse(signature), [signature]);
  const contextKey = `${workspaceKey}:${signature}:${characterEnabled}:${platform}`;
  const context = useMemo(() => Symbol(contextKey), [contextKey]);
  const [state, setState] = useState<HintState>(EMPTY);
  useEffect(() => {
    const mac = isMacPlatform(platform);
    const primary = mac ? 'Meta' : 'Control';
    let held = false;
    let suspended = false;
    let hints: NavigationHint[] = [];
    let prefix = '';
    let reason = '';
    let origin: Element | null = null;
    let letters = '';
    let frame: number | null = null;
    const clear = (release = false) => {
      observer.disconnect();
      if (release) held = false;
      suspended = true;
      hints = []; prefix = ''; reason = '';
      setState(EMPTY);
    };
    const publish = () => setState({ context, held, hints, prefix, reason });
    const signature = () => collectNavigationTargets(shortcuts, platform, characterEnabled);
    const start = () => {
      held = true; suspended = false; prefix = ''; reason = '';
      if (!workspaceKey || hasWorkbenchPopup() || document.querySelector('[data-hackdesk-dragging="true"]')) { clear(); return; }
      origin = document.activeElement;
      letters = safeNavigationLetters(platform, shortcuts, characterEnabled, origin?.closest<HTMLElement>('.cm-editor') ?? null);
      const targets = signature();
      const previous = codesByWorkspace.current.get(workspaceKey) ?? new Map();
      const codes = allocateNavigationCodes(targets.filter(target => !target.element.hasAttribute('aria-keyshortcuts')).map(target => target.id), letters, previous);
      if (!codes) reason = 'No safe navigation keys in this context. Use Tab or your configured shortcuts.';
      if (codes) codesByWorkspace.current.set(workspaceKey, codes);
      hints = targets.map(target => ({ ...target, code: codes?.get(target.id) ?? '', rect: navigationRect(target.element) }));
      observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['hidden', 'inert', 'aria-hidden', 'aria-disabled', 'disabled', 'data-hackdesk-dragging', 'data-editor-mode', 'data-editor-mode-loading', 'data-active-pane', 'data-closed', 'style', 'class'] });
      publish();
    };
    const changed = () => {
      if (!held || suspended) return;
      const targets = signature();
      if (document.activeElement !== origin || targets.length !== hints.length || targets.some((target, index) => target.id !== hints[index].id || target.element !== hints[index].element)
        || letters !== safeNavigationLetters(platform, shortcuts, characterEnabled, origin?.closest<HTMLElement>('.cm-editor') ?? null)) { clear(); return; }
      const next = hints.map(hint => ({ ...hint, rect: navigationRect(hint.element) }));
      if (next.some((hint, index) => ['left', 'top', 'width', 'height'].some(key => hint.rect[key as keyof DOMRect] !== hints[index].rect[key as keyof DOMRect]))) {
        hints = next; publish();
      }
    };
    const scheduleCheck = () => { if (held && !suspended && frame === null) frame = requestAnimationFrame(() => { frame = null; changed(); }); };
    const down = (event: KeyboardEvent) => {
      if (event.key === primary && !event.repeat && !event.isComposing) {
        if (event.altKey || event.shiftKey || (mac ? event.ctrlKey : event.metaKey)) clear();
        else if (!held) start();
        return;
      }
      if (!held || suspended) return;
      if (event.isComposing) { clear(); return; }
      if (event.repeat) return;
      if (!(mac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey) || event.altKey || event.shiftKey) { clear(); return; }
      changed();
      if (suspended) return;
      if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); clear(); return; }
      if (event.key === 'Backspace' && prefix) { event.preventDefault(); event.stopImmediatePropagation(); prefix = prefix.slice(0, -1); publish(); return; }
      const letter = event.key.toLowerCase();
      if (!/^[a-z]$/.test(letter) || !letters.includes(letter) || !hints.some(hint => hint.code.startsWith(prefix + letter))) {
        // Existing app/native/editor bindings retain their original event path.
        clear(); return;
      }
      event.preventDefault(); event.stopImmediatePropagation();
      prefix += letter;
      const target = hints.find(hint => hint.code === prefix);
      if (target) { clear(); navigateToTarget(target); }
      else publish();
    };
    const up = (event: KeyboardEvent) => { if (event.key === primary || !(mac ? event.metaKey : event.ctrlKey)) clear(true); };
    const blur = () => clear(true);
    const pointer = () => { if (held) clear(); };
    const composition = () => { if (held) clear(); };
    window.addEventListener('keydown', down, true);
    window.addEventListener('keyup', up, true);
    window.addEventListener('blur', blur);
    window.addEventListener('pointerdown', pointer, true);
    window.addEventListener('compositionstart', composition, true);
    window.addEventListener('scroll', scheduleCheck, true);
    window.addEventListener('resize', scheduleCheck);
    document.addEventListener('focusin', scheduleCheck);
    const observer = new MutationObserver(scheduleCheck);
    return () => {
      window.removeEventListener('keydown', down, true);
      window.removeEventListener('keyup', up, true);
      window.removeEventListener('blur', blur);
      window.removeEventListener('pointerdown', pointer, true);
      window.removeEventListener('compositionstart', composition, true);
      window.removeEventListener('scroll', scheduleCheck, true);
      window.removeEventListener('resize', scheduleCheck);
      document.removeEventListener('focusin', scheduleCheck);
      observer.disconnect();
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [workspaceKey, shortcuts, platform, characterEnabled, context]);
  const current = state.context === context ? state : EMPTY;
  const visible = current.hints.filter(hint => (!current.prefix || hint.code.startsWith(current.prefix)) && (hint.code || hint.shortcut));
  return <NavigationHintsContext.Provider value={current.held}>
    {children}
    {current.held ? createPortal(<div data-keyboard-navigation-overlay className="pointer-events-none fixed inset-0 z-40" aria-hidden="true">
      {navigationHintPositions(visible.filter(hint => !hint.element.hasAttribute('aria-keyshortcuts')), current.prefix, { width: window.innerWidth, height: window.innerHeight }).map(({ hint, shortcut, left, top }) =>
        <kbd key={hint.id} data-navigation-hint={hint.id} data-navigation-code={hint.code || undefined} className="absolute flex flex-col items-center whitespace-nowrap rounded border border-border-default bg-background-default px-1 font-mono font-semibold text-[color:var(--command-item-title)] shadow-sm" style={{ left, top }}>
          <span className="text-[10px] leading-4">{hint.code.toUpperCase()}</span>
          {shortcut ? <span className="text-[9px] font-normal leading-3">{shortcut}</span> : null}
        </kbd>)}
      {current.reason ? <p data-navigation-unavailable className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded border border-border-default bg-background-default px-3 py-2 text-xs text-text-default shadow-sm">{current.reason}</p> : null}
    </div>, document.body) : null}
  </NavigationHintsContext.Provider>;
}
