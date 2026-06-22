import { Palette, RotateCcw } from 'lucide-react';

import { cn } from '@/lib/utils';

import { FOCUS_RING_CLASS, TEXT_INPUT_CLASS } from './ui';

const CUSTOM_FOLDER_COLOR_ID = 'custom-folder-color';
const CUSTOM_FOLDER_ICON_ID = 'custom-folder-icon';

const folderIconOptions = [
  { label: 'Folder', value: '1F4C1', glyph: '📁' },
  { label: 'Fire', value: '1F525', glyph: '🔥' },
  { label: 'Star', value: '2B50', glyph: '⭐' },
  { label: 'Book', value: '1F4D8', glyph: '📘' },
  { label: 'Bulb', value: '1F4A1', glyph: '💡' },
  { label: 'Target', value: '1F3AF', glyph: '🎯' },
  { label: 'Rocket', value: '1F680', glyph: '🚀' },
  { label: 'Inbox', value: '1F4E5', glyph: '📥' },
] as const;

const folderColorOptions = [
  '#2F80ED',
  '#56CCF2',
  '#27AE60',
  '#F2C94C',
  '#F2994A',
  '#EB5757',
  '#9B51E0',
  '#828282',
] as const;

export function FolderAppearanceFields({
  icon,
  color,
  onIconChange,
  onColorChange,
}: {
  icon: string;
  color: string;
  onIconChange: (icon: string) => void;
  onColorChange: (color: string) => void;
}) {
  const normalizedColor = color.trim();

  return (
    <div className="space-y-4">
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-text-default">Icon</legend>
        <div className="grid grid-cols-4 gap-2">
          {folderIconOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={icon.trim().toUpperCase() === option.value}
              onClick={() => onIconChange(option.value)}
              className={cn(
                'flex size-10 items-center justify-center rounded-md border text-lg transition-colors hover:bg-element-bg-hover aria-pressed:border-primary-default aria-pressed:bg-primary-soft',
                FOCUS_RING_CLASS,
              )}
              title={option.label}
            >
              <span aria-hidden="true">{option.glyph}</span>
              <span className="sr-only">{option.label}</span>
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => onIconChange('')}
          className={cn(
            'inline-flex h-8 items-center gap-2 rounded-md border border-border-default px-2 text-xs text-text-subtle transition-colors hover:bg-element-bg-hover hover:text-text-default',
            FOCUS_RING_CLASS,
          )}
        >
          <RotateCcw aria-hidden="true" className="h-3.5 w-3.5" />
          Use default icon
        </button>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-text-default">Color</legend>
        <div className="grid grid-cols-8 gap-2">
          {folderColorOptions.map((option) => (
            <button
              key={option}
              type="button"
              aria-label={`Use folder color ${option}`}
              aria-pressed={normalizedColor.toUpperCase() === option}
              onClick={() => onColorChange(option)}
              className={cn(
                'size-8 rounded-md border border-border-default transition-transform hover:scale-105 aria-pressed:ring-2 aria-pressed:ring-primary-default aria-pressed:ring-offset-2 aria-pressed:ring-offset-background-default',
                FOCUS_RING_CLASS,
              )}
              style={{ backgroundColor: option }}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={() => onColorChange('')}
          className={cn(
            'inline-flex h-8 items-center gap-2 rounded-md border border-border-default px-2 text-xs text-text-subtle transition-colors hover:bg-element-bg-hover hover:text-text-default',
            FOCUS_RING_CLASS,
          )}
        >
          <Palette aria-hidden="true" className="h-3.5 w-3.5" />
          Use default color
        </button>
      </fieldset>

      <details className="rounded-md border border-border-default bg-background-muted px-3 py-2 text-sm">
        <summary className={cn('cursor-pointer select-none rounded-[4px] text-xs font-semibold uppercase text-text-subtle', FOCUS_RING_CLASS)}>
          Custom values
        </summary>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div className="space-y-2 text-sm">
            <label htmlFor={CUSTOM_FOLDER_ICON_ID} className="font-medium text-text-default">Icon codepoint</label>
            <input
              id={CUSTOM_FOLDER_ICON_ID}
              name="icon"
              value={icon}
              onChange={(event) => onIconChange(event.target.value)}
              className={TEXT_INPUT_CLASS}
              placeholder="1F4C1…"
              autoComplete="off"
              spellCheck={false}
              inputMode="text"
            />
          </div>
          <div className="space-y-2 text-sm">
            <label htmlFor={CUSTOM_FOLDER_COLOR_ID} className="font-medium text-text-default">Color hex</label>
            <span className="flex items-center gap-2">
              <span
                className="size-5 rounded-[4px] border border-border-default"
                style={{ backgroundColor: normalizedColor || 'transparent' }}
                aria-hidden="true"
              />
              <input
                id={CUSTOM_FOLDER_COLOR_ID}
                name="color"
                value={color}
                onChange={(event) => onColorChange(event.target.value)}
                className={TEXT_INPUT_CLASS}
                placeholder="#2F80ED…"
                autoComplete="off"
                spellCheck={false}
                inputMode="text"
              />
            </span>
          </div>
        </div>
      </details>
    </div>
  );
}
