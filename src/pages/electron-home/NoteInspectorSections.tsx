import { X } from 'lucide-react';
import type { Dispatch } from 'react';

import { Button } from '@/components/ui/button';
import type { InspectorFormAction } from './useNoteInspectorForm';

export function TagEditor({
  dispatch,
  id,
  onAddTag,
  onRemoveTag,
  tagDraft,
  tags,
  hideLabel = false,
}: {
  dispatch: Dispatch<InspectorFormAction>;
  id: string;
  onAddTag: (value: string) => void;
  onRemoveTag: (tag: string) => void;
  tagDraft: string;
  tags: string[];
  hideLabel?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      {hideLabel ? null : (
        <label className="text-xs font-medium text-text-subtle" htmlFor={id}>Tags</label>
      )}
      <div className="flex min-h-9 flex-wrap items-center gap-1.5 rounded-md border border-border-default bg-background-default px-2 py-1 transition focus-within:border-focus-ring focus-within:ring-2 focus-within:ring-inset focus-within:ring-focus-ring">
        {tags.map((tag) => (
          <span
            key={tag}
            className="inline-flex h-6 items-center gap-1 rounded-md bg-background-selected px-2 text-xs text-text-default"
          >
            {tag}
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => onRemoveTag(tag)}
              className="-mr-1 rounded-sm focus-visible:ring-inset"
              aria-label={`Remove ${tag} tag`}
            >
              <X aria-hidden="true" className="h-3 w-3" />
            </Button>
          </span>
        ))}
        <input
          id={id}
          name="tag"
          autoComplete="off"
          enterKeyHint="done"
          spellCheck={false}
          value={tagDraft}
          onChange={(event) => dispatch({ type: 'set-tag-draft', value: event.target.value })}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ',') {
              event.preventDefault();
              onAddTag(tagDraft);
              return;
            }

            if (event.key === 'Backspace' && !tagDraft && tags.length > 0) {
              event.preventDefault();
              dispatch({ type: 'set-tags', value: tags.slice(0, -1) });
            }
          }}
          onBlur={() => onAddTag(tagDraft)}
          className="min-w-20 flex-1 bg-transparent text-sm text-text-default outline-none placeholder:text-text-subtle/70"
          placeholder={tags.length === 0 ? 'Add tag…' : ''}
        />
      </div>
    </div>
  );
}
