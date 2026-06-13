import { useCallback, useEffect, useState } from 'react';

export type ElectronFocusZone = 'workspace' | 'navigator' | 'editor' | 'inspector';

function focusZoneElement(zone: ElectronFocusZone) {
  window.requestAnimationFrame(() => {
    const region = document.querySelector<HTMLElement>(`[data-hackdesk-focus="${zone}"]`);
    const focusable = region?.querySelector<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );

    (focusable ?? region)?.focus();
  });
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
