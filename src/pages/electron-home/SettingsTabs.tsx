import { TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

import { SETTINGS_TABS } from './SettingsDialogConfig';
import { FOCUS_RING_CLASS } from './ui';

export function SettingsTabs() {
  return (
    <TabsList
      activateOnFocus
      aria-label="Settings sections"
      className="flex h-full w-40 shrink-0 flex-col items-stretch gap-1 border-r border-border-default bg-background-muted/40 p-3"
    >
      {SETTINGS_TABS.map((tab) => (
        <TabsTrigger
          key={tab.id}
          value={tab.id}
          className={cn(
            'inline-flex h-10 w-full min-w-0 items-center justify-start gap-2 rounded-md px-3 text-sm font-medium transition-colors hover:bg-element-bg-hover',
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
