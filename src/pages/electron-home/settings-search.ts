import { SETTINGS_TABS, type SettingsTab } from './SettingsDialogConfig';

export type SettingsSearchResult = {
  id: string;
  tab: SettingsTab;
  section: string;
  label: string;
  target: HTMLElement | null;
};

export function searchSettings(root: HTMLElement, query: string): SettingsSearchResult[] {
  const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const results: SettingsSearchResult[] = [];
  for (const panel of root.querySelectorAll<HTMLElement>('[data-settings-tab]')) {
    const section = SETTINGS_TABS.find(tab => tab.id === panel.dataset.settingsTab);
    if (!section) continue;
    const seen = new Set<HTMLElement>();
    const add = (label: string, target: HTMLElement | null) => {
      if (target && seen.has(target)) return;
      if (!words.every(word => `${section.label} ${label}`.toLocaleLowerCase().includes(word))) return;
      if (target) seen.add(target);
      results.push({ id: `${section.id}:${target?.id || label}`, tab: section.id, section: section.label, label, target });
    };
    add(section.label, null);
    for (const label of panel.querySelectorAll<HTMLLabelElement>('label')) {
      const target = label.control;
      if (target && panel.contains(target)) add(label.textContent?.trim() ?? '', target);
    }
    for (const control of panel.querySelectorAll<HTMLElement>('button, input[aria-label], [role="combobox"], [role="radio"]')) {
      const label = control.getAttribute('aria-label') ?? control.textContent?.trim();
      if (label && !label.startsWith('About ') && !label.startsWith('Reset shortcut')) add(label, control);
    }
  }
  return results;
}
