import { ChevronRight, Palette, RotateCcw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Field, FieldLabel, Input } from '@/components/ui/field';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { cn } from '@/lib/utils';

import { FOCUS_RING_CLASS } from './ui';

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
  const normalizedIcon = icon.trim().toUpperCase();
  const selectedColor = normalizedColor.toUpperCase();

  return (
    <div className="space-y-4">
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-text-default">Icon</legend>
        <RadioGroup
          value={normalizedIcon}
          onValueChange={(value) => onIconChange(value)}
          className="grid grid-cols-4 gap-2"
        >
          {folderIconOptions.map((option) => (
            <RadioGroupItem
              key={option.value}
              value={option.value}
              aria-label={option.label}
              className={cn(
                'flex size-10 items-center justify-center rounded-md border text-lg transition-colors hover:bg-element-bg-hover data-[checked]:border-primary-default data-[checked]:bg-primary-soft',
                FOCUS_RING_CLASS,
              )}
              title={option.label}
            >
              <span aria-hidden="true">{option.glyph}</span>
              <span className="sr-only">{option.label}</span>
            </RadioGroupItem>
          ))}
        </RadioGroup>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onIconChange('')}
          className="text-text-subtle hover:text-text-default"
        >
          <RotateCcw aria-hidden="true" className="h-3.5 w-3.5" />
          Use default icon
        </Button>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-text-default">Color</legend>
        <RadioGroup
          value={selectedColor}
          onValueChange={(value) => onColorChange(value)}
          className="grid grid-cols-8 gap-2"
        >
          {folderColorOptions.map((option) => (
            <RadioGroupItem
              key={option}
              aria-label={`Use folder color ${option}`}
              value={option}
              className={cn(
                'size-8 rounded-md border border-border-default transition-transform hover:scale-105 data-[checked]:ring-2 data-[checked]:ring-primary-default data-[checked]:ring-offset-2 data-[checked]:ring-offset-background-default',
                FOCUS_RING_CLASS,
              )}
              style={{ backgroundColor: option }}
            />
          ))}
        </RadioGroup>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onColorChange('')}
          className="text-text-subtle hover:text-text-default"
        >
          <Palette aria-hidden="true" className="h-3.5 w-3.5" />
          Use default color
        </Button>
      </fieldset>

      <Collapsible className="rounded-md border border-border-default bg-background-muted px-3 py-2 text-sm">
        <CollapsibleTrigger className={cn('flex w-full items-center justify-between rounded-[4px] text-left text-xs font-semibold uppercase text-text-subtle', FOCUS_RING_CLASS)}>
          <span>Custom values</span>
          <ChevronRight
            aria-hidden="true"
            className="h-3.5 w-3.5 transition-transform group-data-[panel-open]:rotate-90 motion-reduce:transition-none"
          />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="grid grid-cols-2 gap-3 pt-3">
            <Field>
              <FieldLabel htmlFor={CUSTOM_FOLDER_ICON_ID}>Icon codepoint</FieldLabel>
              <Input
                id={CUSTOM_FOLDER_ICON_ID}
                name="icon"
                value={icon}
                onChange={(event) => onIconChange(event.target.value)}
                placeholder="1F4C1…"
                autoComplete="off"
                spellCheck={false}
                inputMode="text"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={CUSTOM_FOLDER_COLOR_ID}>Color hex</FieldLabel>
              <span className="flex items-center gap-2">
                <span
                  className="size-5 rounded-[4px] border border-border-default"
                  style={{ backgroundColor: normalizedColor || 'transparent' }}
                  aria-hidden="true"
                />
                <Input
                  id={CUSTOM_FOLDER_COLOR_ID}
                  name="color"
                  value={color}
                  onChange={(event) => onColorChange(event.target.value)}
                  placeholder="#2F80ED…"
                  autoComplete="off"
                  spellCheck={false}
                  inputMode="text"
                />
              </span>
            </Field>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
