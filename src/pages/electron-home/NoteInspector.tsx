import { Copy, ImagePlus, Loader2, Save, X } from 'lucide-react';
import { type FormEvent, useEffect, useId, useMemo, useState } from 'react';
import { toast } from 'sonner';

import type {
  DocumentSummary,
  NotePermissionRole,
  UpdateNoteInput,
  UploadNoteImageInput,
  UploadNoteImageResult,
} from '@/lib/electron-api';
import type { FolderTree, FolderTreeNode } from '@/lib/hackmd-folders';

import { CollapsibleSection, PanelHeader, ToolbarIconButton } from './interaction-primitives';
import {
  FOCUS_RING_CLASS,
  TEXT_INPUT_CLASS,
  getFolderPathLabel,
} from './ui';

type FolderOption = {
  id: string;
  label: string;
};

const INSPECTOR_INPUT_CLASS = TEXT_INPUT_CLASS
  .replace('h-10', 'h-9')
  .replace('px-3', 'px-2.5');
const INSPECTOR_TEXTAREA_CLASS = `${INSPECTOR_INPUT_CLASS} min-h-16 py-2`;

function getDocumentFolderId(document: DocumentSummary) {
  return document.folderPaths.at(-1)?.id ?? '';
}

function tagsEqual(left: string[], right: string[]) {
  return left.length === right.length && left.every((tag, index) => tag === right[index]);
}

function cleanTag(value: string) {
  return value.trim().replace(/^#/, '');
}

function getFolderOptions(tree: FolderTree) {
  const options: FolderOption[] = [];

  function walk(node: FolderTreeNode) {
    options.push({
      id: node.id,
      label: getFolderPathLabel(node.folderPath) || node.name,
    });

    node.children.forEach(walk);
  }

  tree.roots.forEach(walk);
  return options;
}

function escapeAltText(value: string) {
  return value.replace(/\.[^.]+$/, '').replace(/[[\]]/g, '').trim() || 'image';
}

export function NoteInspector({
  document,
  folderTree,
  isSaving,
  isUploading,
  onSaveMetadata,
  onUploadImage,
  onCopyLink,
  onInsertMarkdown,
}: {
  document: DocumentSummary;
  folderTree: FolderTree;
  isSaving: boolean;
  isUploading: boolean;
  onSaveMetadata: (document: DocumentSummary, input: UpdateNoteInput) => void;
  onUploadImage: (document: DocumentSummary, input: UploadNoteImageInput) => Promise<UploadNoteImageResult>;
  onCopyLink: (document: DocumentSummary) => void;
  onInsertMarkdown: (markdown: string) => void;
}) {
  const descriptionId = useId();
  const tagsId = useId();
  const permalinkId = useId();
  const folderId = useId();
  const readPermissionId = useId();
  const writePermissionId = useId();
  const imageId = useId();
  const folderOptions = useMemo(() => getFolderOptions(folderTree), [folderTree]);
  const currentFolderId = getDocumentFolderId(document);
  const [description, setDescription] = useState(document.description);
  const [tags, setTags] = useState(document.tags);
  const [tagDraft, setTagDraft] = useState('');
  const [permalink, setPermalink] = useState(document.permalink ?? '');
  const [parentFolderId, setParentFolderId] = useState(currentFolderId);
  const [readPermission, setReadPermission] = useState<NotePermissionRole>(document.readPermission);
  const [writePermission, setWritePermission] = useState<NotePermissionRole>(document.writePermission);
  const [imageFile, setImageFile] = useState<File | null>(null);

  useEffect(() => {
    setDescription(document.description);
    setTags(document.tags);
    setTagDraft('');
    setPermalink(document.permalink ?? '');
    setParentFolderId(currentFolderId);
    setReadPermission(document.readPermission);
    setWritePermission(document.writePermission);
    setImageFile(null);
  }, [
    document.id,
    document.description,
    document.tags,
    document.permalink,
    document.readPermission,
    document.writePermission,
    currentFolderId,
  ]);

  const descriptionDirty = description !== document.description;
  const tagsDirty = !tagsEqual(tags, document.tags);
  const permalinkDirty = permalink !== (document.permalink ?? '');
  const locationDirty = parentFolderId !== currentFolderId;
  const permissionsDirty =
    readPermission !== document.readPermission
    || writePermission !== document.writePermission;
  const metadataDirty =
    descriptionDirty
    || tagsDirty
    || permalinkDirty
    || locationDirty
    || permissionsDirty;

  const addTag = (value: string) => {
    const nextTag = cleanTag(value);
    if (!nextTag) {
      return;
    }

    setTags((current) => {
      if (current.some((tag) => tag.toLowerCase() === nextTag.toLowerCase())) {
        toast.info('Tag already exists.');
        return current;
      }

      return [...current, nextTag];
    });
    setTagDraft('');
  };

  const removeTag = (tagToRemove: string) => {
    setTags((current) => current.filter((tag) => tag !== tagToRemove));
  };

  const handleMetadataSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const input: UpdateNoteInput = {};

    if (description !== document.description) {
      input.description = description;
    }
    if (!tagsEqual(tags, document.tags)) {
      input.tags = tags;
    }
    if (permalink !== (document.permalink ?? '')) {
      input.permalink = permalink.trim();
    }
    if (readPermission !== document.readPermission) {
      input.readPermission = readPermission;
    }
    if (writePermission !== document.writePermission) {
      input.writePermission = writePermission;
    }
    if (parentFolderId !== currentFolderId) {
      input.parentFolderId = parentFolderId || null;
    }

    onSaveMetadata(document, input);
  };

  const handleImageUpload = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!imageFile) {
      return;
    }

    try {
      const bytes = await imageFile.arrayBuffer();
      const result = await onUploadImage(document, {
        fileName: imageFile.name,
        mimeType: imageFile.type || 'application/octet-stream',
        bytes,
      });

      onInsertMarkdown(`\n![${escapeAltText(imageFile.name)}](${result.link})\n`);
      setImageFile(null);
      toast.success('Image uploaded.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to upload image.');
    }
  };

  return (
    <aside
      data-hackdesk-focus="inspector"
      tabIndex={-1}
      className="flex h-full w-80 flex-col bg-background-muted outline-none"
    >
      <PanelHeader
        title="Inspector"
        subtitle={document.shortId}
        className="px-3 py-2.5"
        actions={(
          <ToolbarIconButton
            onClick={() => onCopyLink(document)}
            label="Copy Link"
          >
            <Copy aria-hidden="true" className="h-4 w-4" />
          </ToolbarIconButton>
        )}
      />

      <div className="min-h-0 flex-1 overflow-auto px-3 py-2.5">
        <form onSubmit={handleMetadataSubmit}>
          <CollapsibleSection title="Metadata" dirty={descriptionDirty || tagsDirty || permalinkDirty} className="py-2" contentClassName="space-y-2 pt-2">
            <fieldset className="space-y-2.5">
              <legend className="sr-only">Metadata</legend>
              <label className="block space-y-1.5 text-sm" htmlFor={descriptionId}>
                <span className="font-medium text-text-default">Description</span>
                <textarea
                  id={descriptionId}
                  name="description"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  className={INSPECTOR_TEXTAREA_CLASS}
                  rows={3}
                />
              </label>

              <div className="space-y-1.5 text-sm">
                <label className="font-medium text-text-default" htmlFor={tagsId}>Tags</label>
                <div className="flex min-h-9 flex-wrap items-center gap-1.5 rounded-md border border-border-default bg-background-default px-2 py-1">
                  {tags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex h-6 items-center gap-1 rounded-[6px] bg-background-selected px-2 text-xs text-text-default"
                    >
                      {tag}
                      <button
                        type="button"
                        onClick={() => removeTag(tag)}
                        className={`text-text-subtle hover:text-text-default ${FOCUS_RING_CLASS}`}
                        aria-label={`Remove ${tag} tag`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                  <input
                    id={tagsId}
                    name="tag"
                    value={tagDraft}
                    onChange={(event) => setTagDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ',') {
                        event.preventDefault();
                        addTag(tagDraft);
                        return;
                      }

                      if (event.key === 'Backspace' && !tagDraft && tags.length > 0) {
                        event.preventDefault();
                        setTags((current) => current.slice(0, -1));
                      }
                    }}
                    onBlur={() => addTag(tagDraft)}
                    className="min-w-20 flex-1 bg-transparent text-sm outline-none"
                    placeholder={tags.length === 0 ? 'Add tag' : ''}
                  />
                </div>
              </div>

              <label className="block space-y-1.5 text-sm" htmlFor={permalinkId}>
                <span className="font-medium text-text-default">Permalink</span>
                <input
                  id={permalinkId}
                  name="permalink"
                  value={permalink}
                  onChange={(event) => setPermalink(event.target.value)}
                  className={INSPECTOR_INPUT_CLASS}
                  placeholder="custom-slug"
                />
              </label>
            </fieldset>
          </CollapsibleSection>

          <CollapsibleSection title="Location" dirty={locationDirty} className="py-2" contentClassName="space-y-2 pt-2">
            <fieldset className="space-y-2.5">
              <legend className="sr-only">Location</legend>
              <label className="block space-y-1.5 text-sm" htmlFor={folderId}>
                <span className="font-medium text-text-default">Folder</span>
                <select
                  id={folderId}
                  name="parentFolderId"
                  value={parentFolderId}
                  onChange={(event) => setParentFolderId(event.target.value)}
                  className={INSPECTOR_INPUT_CLASS}
                >
                  <option value="">Root</option>
                  {folderOptions.map((option) => (
                    <option key={option.id} value={option.id}>{option.label}</option>
                  ))}
                </select>
              </label>
            </fieldset>
          </CollapsibleSection>

          <CollapsibleSection title="Permissions" dirty={permissionsDirty} className="py-2" contentClassName="space-y-2 pt-2">
            <fieldset className="space-y-2.5">
              <legend className="sr-only">Permissions</legend>
              <label className="block space-y-1.5 text-sm" htmlFor={readPermissionId}>
                <span className="font-medium text-text-default">Read</span>
                <select
                  id={readPermissionId}
                  name="readPermission"
                  value={readPermission}
                  onChange={(event) => setReadPermission(event.target.value as NotePermissionRole)}
                  className={INSPECTOR_INPUT_CLASS}
                >
                  <option value="owner">Owner</option>
                  <option value="signed_in">Signed in</option>
                  <option value="guest">Guest</option>
                </select>
              </label>
              <label className="block space-y-1.5 text-sm" htmlFor={writePermissionId}>
                <span className="font-medium text-text-default">Write</span>
                <select
                  id={writePermissionId}
                  name="writePermission"
                  value={writePermission}
                  onChange={(event) => setWritePermission(event.target.value as NotePermissionRole)}
                  className={INSPECTOR_INPUT_CLASS}
                >
                  <option value="owner">Owner</option>
                  <option value="signed_in">Signed in</option>
                  <option value="guest">Guest</option>
                </select>
              </label>
            </fieldset>
          </CollapsibleSection>

          <div className="flex justify-end pt-2">
            <ToolbarIconButton
              type="submit"
              disabled={!metadataDirty || isSaving}
              title={!metadataDirty ? 'No metadata changes.' : undefined}
              label="Save Metadata"
              tooltip={metadataDirty ? 'Save metadata' : 'No metadata changes.'}
              className={metadataDirty ? 'bg-primary-default text-primary-foreground hover:bg-primary-hover hover:text-primary-foreground' : undefined}
            >
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            </ToolbarIconButton>
          </div>
        </form>

        <form className="mt-1" onSubmit={handleImageUpload}>
          <CollapsibleSection title="Images" dirty={Boolean(imageFile)} className="py-2" contentClassName="space-y-2 pt-2">
            <fieldset className="space-y-2">
              <legend className="sr-only">Images</legend>
              <label className="block space-y-1.5 text-sm" htmlFor={imageId}>
                <span className="font-medium text-text-default">Upload Image</span>
                <input
                  id={imageId}
                  name="image"
                  aria-label="Upload Image"
                  type="file"
                  accept="image/*"
                  onChange={(event) => setImageFile(event.target.files?.[0] ?? null)}
                  className="peer sr-only"
                />
                <span className="flex items-center gap-2">
                  <span
                    className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border border-border-default text-text-subtle transition-colors hover:bg-background-selected hover:text-text-default peer-focus-visible:outline-none peer-focus-visible:ring-2 peer-focus-visible:ring-primary-default"
                    aria-hidden="true"
                  >
                    <ImagePlus className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-xs text-text-subtle">
                    {imageFile ? imageFile.name : 'No image selected'}
                  </span>
                </span>
              </label>
            </fieldset>
            <div className="flex justify-end">
              <ToolbarIconButton
                type="submit"
                disabled={!imageFile || isUploading}
                label="Upload and Insert"
                tooltip={imageFile ? 'Upload and insert image' : 'Choose an image first.'}
              >
                {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
              </ToolbarIconButton>
            </div>
          </CollapsibleSection>
        </form>
      </div>
    </aside>
  );
}
