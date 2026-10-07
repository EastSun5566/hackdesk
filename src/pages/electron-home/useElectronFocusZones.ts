import { useCallback, useEffect, useRef, useState } from 'react';

export type ElectronFocusZone = 'workspace' | 'navigator' | 'tabs' | 'editor' | 'inspector';
const ZONE_ORDER: ElectronFocusZone[] = ['workspace', 'navigator', 'tabs', 'editor', 'inspector'];

function isAvailable(element: HTMLElement) {
  if (!element.isConnected || element.closest('[hidden], [inert], [aria-hidden="true"], [data-hackdesk-focus-disabled="true"]')) return false;
  // Also exclude ancestors hidden by CSS (e.g. a closing collapsible panel).
  for (let current: HTMLElement | null = element; current; current = current.parentElement) {
    const style = window.getComputedStyle(current);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
  }
  return !element.matches(':disabled, [aria-disabled="true"]');
}

function getRegions() {
  const regions = Array.from(document.querySelectorAll<HTMLElement>('[data-hackdesk-focus]')).filter(isAvailable);
  return ZONE_ORDER.flatMap(zone => regions.filter(region => region.dataset.hackdeskFocus === zone));
}

function regionKey(region: HTMLElement) {
  const paneId = region.closest<HTMLElement>('[data-document-pane-id]')?.dataset.documentPaneId ?? '';
  return `${region.dataset.hackdeskFocus}:${paneId}`;
}

function hasOpenPopup() {
  return Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]'))
    .some(element => !element.hasAttribute('data-closed') && isAvailable(element));
}

export function useElectronFocusZones() {
  const [focusedZone, setFocusedZone] = useState<ElectronFocusZone>('navigator');
  const [focusedPaneId, setFocusedPaneId] = useState<string | null>(null);
  const rememberedTargetsRef = useRef(new Map<string, HTMLElement>());
  const pendingFrameRef = useRef<number | null>(null);

  const focusRegion = useCallback((key: string, waitForEditor = false) => {
    if (pendingFrameRef.current !== null) window.cancelAnimationFrame(pendingFrameRef.current);
    let attempts = 0;
    const focusWhenReady = () => {
      pendingFrameRef.current = null;
      if (hasOpenPopup()) return;
      const region = getRegions().find(candidate => regionKey(candidate) === key);
      if (!region) return;
      const remembered = rememberedTargetsRef.current.get(key);
      const ownsTarget = (element: HTMLElement) => element.closest('[data-hackdesk-focus]') === region && isAvailable(element);
      const candidates = Array.from(region.querySelectorAll<HTMLElement>(
        '[data-hackdesk-focus-target="true"], [role="treeitem"][tabindex="0"], [role="tab"][tabindex="0"], button, input, textarea, select, [tabindex]:not([tabindex="-1"])',
      )).filter(ownsTarget);
      const focusTarget = candidates.find(candidate => candidate.matches('[role="treeitem"][tabindex="0"], [role="tab"][tabindex="0"]'))
        ?? candidates.find(candidate => candidate.dataset.hackdeskFocusTarget === 'true');
      if (!focusTarget && waitForEditor && attempts < 8) {
        attempts += 1;
        pendingFrameRef.current = window.requestAnimationFrame(focusWhenReady);
        return;
      }
      const target = remembered && ownsTarget(remembered) ? remembered : focusTarget ?? candidates[0] ?? region;
      target.focus();
    };
    pendingFrameRef.current = window.requestAnimationFrame(focusWhenReady);
  }, []);

  const focusZone = useCallback((zone: ElectronFocusZone) => {
    // Resolve after React has applied the active-pane change requested by an action.
    if (pendingFrameRef.current !== null) window.cancelAnimationFrame(pendingFrameRef.current);
    pendingFrameRef.current = window.requestAnimationFrame(() => {
      pendingFrameRef.current = null;
      const candidates = getRegions().filter(region => region.dataset.hackdeskFocus === zone);
      const activePane = document.querySelector('[data-active-pane="true"]');
      const region = candidates.find(candidate => candidate.closest('[data-active-pane="true"]'))
        ?? (zone === 'editor' && activePane ? undefined : candidates[0]);
      if (region) focusRegion(regionKey(region), zone === 'editor');
    });
  }, [focusRegion]);

  const focusNextZone = useCallback((backwards = false) => {
    if (hasOpenPopup()) return false;
    const regions = getRegions();
    if (!regions.length) return false;
    const current = document.activeElement?.closest('[data-hackdesk-focus]');
    const currentIndex = regions.findIndex(region => region === current);
    const nextIndex = currentIndex < 0 ? (backwards ? regions.length - 1 : 0)
      : (currentIndex + (backwards ? -1 : 1) + regions.length) % regions.length;
    focusRegion(regionKey(regions[nextIndex]), regions[nextIndex].dataset.hackdeskFocus === 'editor');
    return true;
  }, [focusRegion]);

  useEffect(() => {
    const handleFocusIn = (event: FocusEvent) => {
      if (!(event.target instanceof HTMLElement)) return;
      const region = event.target.closest<HTMLElement>('[data-hackdesk-focus]');
      const zone = region?.dataset.hackdeskFocus as ElectronFocusZone | undefined;
      if (!region || !zone || !ZONE_ORDER.includes(zone)) return;
      rememberedTargetsRef.current.set(regionKey(region), event.target);
      setFocusedZone(zone);
      setFocusedPaneId(region.closest<HTMLElement>('[data-document-pane-id]')?.dataset.documentPaneId ?? null);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || event.repeat || event.key !== 'F6' || event.altKey || event.ctrlKey || event.metaKey) return;
      if (focusNextZone(event.shiftKey)) event.preventDefault();
    };
    document.addEventListener('focusin', handleFocusIn);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('focusin', handleFocusIn);
      document.removeEventListener('keydown', handleKeyDown);
      if (pendingFrameRef.current !== null) window.cancelAnimationFrame(pendingFrameRef.current);
    };
  }, [focusNextZone]);

  return { focusedZone, focusedPaneId, focusZone, focusNextZone };
}
