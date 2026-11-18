import { ChevronRight, Palette, RotateCcw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Field, FieldLabel, Input } from '@/components/ui/field';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';

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
        >
          <div className="grid grid-cols-4 gap-2">
            {folderIconOptions.map((option) => (
              <RadioGroupItem
                key={option.value}
                value={option.value}
                aria-label={option.label}
                variant="swatch"
                className="size-10"
                title={option.label}
              >
                <span aria-hidden="true">{option.glyph}</span>
                <span className="sr-only">{option.label}</span>
              </RadioGroupItem>
            ))}
          </div>
        </RadioGroup>
        <Button
          variant="secondary-subtle"
          size="sm"
          onClick={() => onIconChange('')}
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
        >
          <div className="grid grid-cols-8 gap-2">
            {folderColorOptions.map((option) => (
              <RadioGroupItem
                key={option}
                aria-label={`Use folder color ${option}`}
                value={option}
                variant="color-swatch"
                className="size-8"
                style={{ '--swatch': option }}
              />
            ))}
          </div>
        </RadioGroup>
        <Button
          variant="secondary-subtle"
          size="sm"
          onClick={() => onColorChange('')}
        >
          <Palette aria-hidden="true" className="h-3.5 w-3.5" />
          Use default color
        </Button>
      </fieldset>

      <Collapsible variant="card">
        <CollapsibleTrigger variant="card" className="flex w-full items-center justify-between">
          <span>Custom values</span>
          <ChevronRight
            aria-hidden="true"
            className="h-3.5 w-3.5 transition-transform duration-150 ease-out group-data-[panel-open]:rotate-90 motion-reduce:transition-none"
          />
        </CollapsibleTrigger>
        <CollapsibleContent>
          {/* items-end: the two inputs share a line even when one label wraps. */}
          <div className="grid grid-cols-2 items-end gap-3 pt-3">
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
                  className="size-5 rounded-sm border border-border-default bg-(--swatch)"
                  style={{ '--swatch': normalizedColor || 'transparent' }}
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
