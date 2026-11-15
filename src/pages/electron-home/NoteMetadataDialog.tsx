import { ChevronRight, History, Loader2, Save, SlidersHorizontal } from 'lucide-react';
import { type FormEvent, useId, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/field';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectLabelValue,
  SelectTrigger,
} from '@/components/ui/select';
import { countWordsInText } from '@/lib/editor-status-store';
import type { DocumentSummary, UpdateNoteInput } from '@/lib/electron-api';
import type { FolderTree } from '@/lib/hackmd-folders';
import { cn } from '@/lib/utils';

import { TagEditor } from './NoteInspectorSections';
import { SettingsSection } from './SettingsPrimitives';
import { formatDate } from './ui';
import { useNoteInspectorForm } from './useNoteInspectorForm';

type NoteMetadataDialogProps = {
  open: boolean;
  document: DocumentSummary;
  content: string;
  folderTree: FolderTree;
  isSaving: boolean;
  onOpenChange: (open: boolean) => void;
  onSaveMetadata: (document: DocumentSummary, input: UpdateNoteInput) => void;
  onOpenVersions?: () => void;
};

export function NoteMetadataDialog(props: NoteMetadataDialogProps) {
  return (
    <NoteMetadataDialogContent
      {...props}
      key={`${props.document.id}:${props.open ? 'open' : 'closed'}`}
    />
  );
}

function getLocationLabel(document: DocumentSummary) {
  const workspace = document.teamPath ? `@${document.teamPath}` : 'My Workspace';
  if (!document.folderPaths.length) return workspace;
  return `${workspace} / ${document.folderPaths.map((folder) => folder.name).join(' / ')}`;
}

function NoteMetadataDialogContent({
  open,
  document,
  content,
  folderTree,
  isSaving,
  onOpenChange,
  onSaveMetadata,
  onOpenVersions,
}: NoteMetadataDialogProps) {
  const tagsId = useId();
  const folderId = useId();
  const descriptionId = useId();
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const inspector = useNoteInspectorForm({
    actions: {
      onCopyLink: () => {},
      onSaveMetadata,
    },
    document,
    folderTree,
  });

  const metadataDirty =
    inspector.dirty.description
    || inspector.dirty.tags
    || inspector.dirty.location;

  const folderSelectOptions = [
    { value: '', label: 'Root' },
    ...inspector.folderOptions.map((option) => ({ value: option.id, label: option.label })),
  ];
  const folderLabels = Object.fromEntries(folderSelectOptions.map((option) => [option.value, option.label]));

  const words = countWordsInText(content);
  const readingMinutes = Math.max(1, Math.round(words / 200));
  const noteTitle = document.title.trim() || 'Untitled';

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const input: UpdateNoteInput = {};
    if (inspector.dirty.description) input.description = inspector.state.description;
    if (inspector.dirty.tags) input.tags = inspector.state.tags;
    if (inspector.dirty.location) input.parentFolderId = inspector.state.parentFolderId || null;

    if (Object.keys(input).length > 0) {
      onSaveMetadata(document, input);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-145">
        <DialogHeader className="pr-8">
          <DialogTitle className="flex items-center gap-2">
            <SlidersHorizontal aria-hidden="true" className="h-4 w-4 text-text-subtle" />
            Note Settings
          </DialogTitle>
          <DialogDescription className="truncate text-xs">
            {noteTitle} · {getLocationLabel(document)}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <SettingsSection title="Metadata">
            <div className="flex flex-col gap-2 text-sm sm:flex-row sm:items-start sm:gap-4">
              <div className="sm:w-36 sm:shrink-0 sm:pt-1.5">
                <label className="font-medium leading-5 text-text-default" htmlFor={tagsId}>
                  Tags
                </label>
                <p className="text-xs leading-5 text-text-subtle">Filter & group notes</p>
              </div>
              <div className="min-w-0 flex-1">
                <TagEditor
                  hideLabel
                  id={tagsId}
                  onAddTag={inspector.actions.addTag}
                  onRemoveTag={inspector.actions.removeTag}
                  dispatch={inspector.dispatch}
                  tagDraft={inspector.state.tagDraft}
                  tags={inspector.state.tags}
                />
              </div>
            </div>

            <div className="flex flex-col gap-2 text-sm sm:flex-row sm:items-center sm:gap-4">
              <div className="sm:w-36 sm:shrink-0">
                <label className="font-medium leading-5 text-text-default" htmlFor={folderId}>
                  Folder
                </label>
                <p className="text-xs leading-5 text-text-subtle">Workspace location</p>
              </div>
              <div className="min-w-0 flex-1">
                <Select
                  name="parentFolderId"
                  value={inspector.state.parentFolderId}
                  onValueChange={(value) => {
                    if (typeof value === 'string') {
                      inspector.dispatch({ type: 'set-parent-folder-id', value });
                    }
                  }}
                  items={folderSelectOptions}
                >
                  <SelectTrigger
                    id={folderId}
                    aria-label="Folder"
                    className="h-9 w-full justify-between bg-background-default px-2.5 text-text-default focus-visible:ring-inset"
                  >
                    <SelectLabelValue value={inspector.state.parentFolderId} labels={folderLabels} />
                  </SelectTrigger>
                  <SelectContent>
                    {folderSelectOptions.map((option) => (
                      <SelectItem key={option.value || '__root__'} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex flex-col gap-2 text-sm sm:flex-row sm:items-start sm:gap-4">
              <div className="sm:w-36 sm:shrink-0 sm:pt-1">
                <label className="font-medium leading-5 text-text-default" htmlFor={descriptionId}>
                  Description
                </label>
                <p className="text-xs leading-5 text-text-subtle">Search & share summary</p>
              </div>
              <div className="min-w-0 flex-1">
                <Textarea
                  id={descriptionId}
                  aria-label="Description"
                  name="description"
                  autoComplete="off"
                  value={inspector.state.description}
                  onChange={(event) => inspector.dispatch({ type: 'set-description', value: event.target.value })}
                  placeholder="Add a brief summary…"
                  className="min-h-16 bg-background-default px-2.5 py-2 text-text-default focus-visible:ring-inset"
                  rows={3}
                />
              </div>
            </div>
          </SettingsSection>

          <div className="settings-card">
            <button
              type="button"
              aria-expanded={advancedOpen}
              onClick={() => setAdvancedOpen((current) => !current)}
              className="flex w-full items-center justify-between gap-3 text-left text-sm transition-colors hover:bg-background-hover/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring"
            >
              <span className="flex min-w-0 items-center gap-2">
                <ChevronRight
                  aria-hidden="true"
                  className={cn(
                    'h-4 w-4 shrink-0 text-text-subtle transition-transform duration-150 motion-reduce:transition-none',
                    advancedOpen && 'rotate-90',
                  )}
                />
                <span className="font-medium text-text-default">Advanced Info</span>
                <span className="truncate text-xs text-text-subtle">
                  {words} {words === 1 ? 'word' : 'words'} · {readingMinutes} min read
                </span>
              </span>
              <span className="shrink-0 text-xs text-text-subtle">
                {advancedOpen ? 'Hide' : 'Show'}
              </span>
            </button>

            {advancedOpen ? (
              <>
                {onOpenVersions ? (
                  <div className="flex items-center justify-between gap-4 text-sm">
                    <span className="text-text-subtle">Version History</span>
                    <Button
                      type="button"
                      size="xs"
                      variant="secondary"
                      onClick={() => {
                        onOpenChange(false);
                        onOpenVersions();
                      }}
                    >
                      <History aria-hidden="true" className="h-3.5 w-3.5" />
                      Open Version History
                    </Button>
                  </div>
                ) : null}
                <div className="flex items-center justify-between gap-4 text-sm">
                  <span className="text-text-subtle">Note ID & Publish Mode</span>
                  <span className="truncate font-mono text-xs text-text-default">
                    {document.shortId} · {document.publishType}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-4 text-sm">
                  <span className="text-text-subtle">Created / Updated</span>
                  <span className="truncate text-xs text-text-default">
                    {formatDate(document.createdAtMillis)} · {formatDate(document.updatedAtMillis)}
                  </span>
                </div>
              </>
            ) : null}
          </div>

          <DialogFooter className="items-center justify-between gap-3 pt-1 sm:justify-between">
            <span className="min-w-0 truncate text-xs text-text-subtle" aria-live="polite">
              {isSaving
                ? 'Saving settings…'
                : metadataDirty
                  ? 'Unsaved changes'
                  : 'All changes saved'}
            </span>
            <div className="flex shrink-0 items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                type="submit"
                disabled={!metadataDirty || isSaving}
              >
                {isSaving
                  ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin motion-reduce:animate-none" />
                  : <Save aria-hidden="true" className="h-4 w-4" />}
                <span>{isSaving ? 'Saving…' : 'Save Settings'}</span>
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
