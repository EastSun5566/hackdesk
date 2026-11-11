import { useMemo, useRef, useState } from 'react';

import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { toast } from '@/components/ui/toast';
import {
  APP_ICON_OPTIONS,
  getAppIconDataUri,
  type AppIconGroup,
  type AppIconId,
} from '@/lib/app-icons';
import { isMacPlatform } from '@/lib/keyboard-shortcuts';
import { cn } from '@/lib/utils';

import { SettingsSection } from './SettingsPrimitives';
import { FOCUS_RING_CLASS } from './ui';

const GROUP_LABELS: Record<AppIconGroup, string> = {
  classic: 'Classic',
  single: 'Single Tile',
  fun: 'Fun',
  secret: 'Secret',
};

const SECRET_UNLOCK_CLICKS = 5;

function isSecretIcon(id: AppIconId) {
  return APP_ICON_OPTIONS.some((option) => option.id === id && option.group === 'secret');
}

export function AppIconSettings({
  value,
  platform,
  onChange,
}: {
  value: AppIconId;
  platform: string;
  onChange: (value: AppIconId) => void;
}) {
  const shape = isMacPlatform(platform) ? 'macos' : 'square';
  const [secretsRevealed, setSecretsRevealed] = useState(() => isSecretIcon(value));
  const repeatClicksRef = useRef(0);

  const groups = useMemo(() => {
    const visible = APP_ICON_OPTIONS.filter((option) => option.group !== 'secret' || secretsRevealed);
    return (Object.keys(GROUP_LABELS) as AppIconGroup[])
      .map((group) => ({
        group,
        options: visible.filter((option) => option.group === group).map((option) => ({
          ...option,
          src: getAppIconDataUri(option.id, shape),
        })),
      }))
      .filter(({ options }) => options.length > 0);
  }, [secretsRevealed, shape]);

  // Easter egg: keep clicking the icon that is already selected.
  const handleOptionClick = (id: AppIconId) => {
    if (secretsRevealed) {
      return;
    }

    repeatClicksRef.current = id === value ? repeatClicksRef.current + 1 : 0;
    if (repeatClicksRef.current >= SECRET_UNLOCK_CLICKS) {
      setSecretsRevealed(true);
      toast.success('Secret icons unlocked.');
    }
  };

  return (
    <SettingsSection
      title="App Icon"
      help="Changes the Dock, taskbar, and window icons while HackDesk is running. Finder and the installer keep the default icon."
    >
      <RadioGroup
        name="app-icon"
        aria-label="App icon"
        value={value}
        onValueChange={(next) => onChange(next as AppIconId)}
        className="space-y-4"
      >
        {groups.map(({ group, options }) => (
          <div key={group} className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-text-subtle">{GROUP_LABELS[group]}</p>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))] gap-2">
              {options.map((option) => (
                <RadioGroupItem
                  key={option.id}
                  value={option.id}
                  aria-label={group === 'single' ? `${option.label} (single tile)` : option.label}
                  onClick={() => handleOptionClick(option.id)}
                  className={cn(
                    'flex h-auto w-full cursor-pointer flex-col items-center gap-1.5 rounded-md border border-transparent px-1.5 py-2 text-center hover:bg-element-bg-hover',
                    FOCUS_RING_CLASS,
                    'data-[checked]:border-primary-default/50 data-[checked]:bg-primary-soft/40',
                  )}
                >
                  <img src={option.src} alt="" className="h-14 w-14" draggable={false} />
                  <span className="text-xs leading-tight text-text-default">{option.label}</span>
                </RadioGroupItem>
              ))}
            </div>
          </div>
        ))}
      </RadioGroup>
    </SettingsSection>
  );
}
