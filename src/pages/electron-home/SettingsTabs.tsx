import { TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

import { SETTINGS_TABS } from './SettingsDialogConfig';
import { FOCUS_RING_CLASS } from './ui';

export function SettingsTabs() {
  return (
    <TabsList
      activateOnFocus
      aria-label="Settings sections"
      className="mt-4 grid grid-cols-3 gap-1 rounded-lg bg-background-muted p-1 sm:grid-cols-6"
    >
      {SETTINGS_TABS.map((tab) => (
        <TabsTrigger
          key={tab.id}
          value={tab.id}
          className={cn(
            'inline-flex h-9 min-w-0 items-center justify-center gap-1.5 rounded-md px-2 text-xs font-medium transition-colors hover:bg-element-bg-hover',
            FOCUS_RING_CLASS,
            'text-text-subtle data-[selected]:bg-background-default data-[selected]:text-text-default data-[selected]:shadow-sm',
          )}
        >
          <span aria-hidden="true">{tab.icon}</span>
          <span className="truncate">{tab.label}</span>
        </TabsTrigger>
      ))}
    </TabsList>
  );
}
