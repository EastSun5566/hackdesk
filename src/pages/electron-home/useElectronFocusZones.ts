import { useCallback, useEffect, useState } from 'react';

export type ElectronFocusZone = 'workspace' | 'navigator' | 'editor' | 'inspector';

function focusZoneElement(zone: ElectronFocusZone) {
  let attempts = 0;
  const maxTargetWaitAttempts = zone === 'editor' ? 8 : 0;

  const focusWhenReady = () => {
    const region = document.querySelector<HTMLElement>(`[data-hackdesk-focus="${zone}"]`);
    const focusTarget = region?.querySelector<HTMLElement>('[data-hackdesk-focus-target="true"]');

    if (!focusTarget && attempts < maxTargetWaitAttempts) {
      attempts += 1;
      window.requestAnimationFrame(focusWhenReady);
      return;
    }

    const focusable = focusTarget ?? region?.querySelector<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );

    (focusable ?? region)?.focus();
  };

  window.requestAnimationFrame(focusWhenReady);
}

export function useElectronFocusZones() {
  const [focusedZone, setFocusedZone] = useState<ElectronFocusZone>('navigator');

  const focusZone = useCallback((zone: ElectronFocusZone) => {
    setFocusedZone(zone);
    focusZoneElement(zone);
  }, []);

  useEffect(() => {
    const handleFocusIn = (event: FocusEvent) => {
      const target = event.target instanceof Element
        ? event.target.closest<HTMLElement>('[data-hackdesk-focus]')
        : null;
      const zone = target?.dataset.hackdeskFocus;

      if (zone === 'workspace' || zone === 'navigator' || zone === 'editor' || zone === 'inspector') {
        setFocusedZone(zone);
      }
    };

    document.addEventListener('focusin', handleFocusIn);
    return () => document.removeEventListener('focusin', handleFocusIn);
  }, []);

  return {
    focusedZone,
    focusZone,
  };
}
