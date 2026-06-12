import { ImagePlus, Loader2, Save, X } from 'lucide-react';
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

import {
  FOCUS_RING_CLASS,
  PRIMARY_BUTTON_CLASS,
  SECONDARY_BUTTON_CLASS,
  TEXT_INPUT_CLASS,
  getFolderPathLabel,
} from './ui';

type FolderOption = {
  id: string;
  label: string;
};

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
  onInsertMarkdown,
}: {
  document: DocumentSummary;
  folderTree: FolderTree;
  isSaving: boolean;
  isUploading: boolean;
  onSaveMetadata: (document: DocumentSummary, input: UpdateNoteInput) => void;
  onUploadImage: (document: DocumentSummary, input: UploadNoteImageInput) => Promise<UploadNoteImageResult>;
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

  const metadataDirty =
    description !== document.description
    || permalink !== (document.permalink ?? '')
    || !tagsEqual(tags, document.tags)
    || readPermission !== document.readPermission
    || writePermission !== document.writePermission
    || Boolean(parentFolderId && parentFolderId !== currentFolderId);

  const addTag = (value: string) => {
    const nextTag = cleanTag(value);
    if (!nextTag) {
      return;
    }

    setTags((current) => current.some((tag) => tag.toLowerCase() === nextTag.toLowerCase())
      ? current
      : [...current, nextTag]);
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
    if (parentFolderId && parentFolderId !== currentFolderId) {
      input.parentFolderId = parentFolderId;
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
    <aside className="flex h-full w-80 flex-col bg-background-muted">
      <div className="border-b border-border-default px-4 py-3">
        <h2 className="text-sm font-semibold text-text-default">Inspector</h2>
        <p className="mt-1 truncate text-xs text-text-subtle">{document.shortId}</p>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-4 py-4">
        <form className="space-y-5" onSubmit={handleMetadataSubmit}>
          <fieldset className="space-y-3">
            <legend className="text-xs font-semibold uppercase tracking-wide text-text-subtle">Metadata</legend>
            <label className="block space-y-2 text-sm" htmlFor={descriptionId}>
              <span className="font-medium text-text-default">Description</span>
              <textarea
                id={descriptionId}
                name="description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                className={`${TEXT_INPUT_CLASS} min-h-20 py-2`}
                rows={3}
              />
            </label>

            <div className="space-y-2 text-sm">
              <label className="font-medium text-text-default" htmlFor={tagsId}>Tags</label>
              <div className="flex min-h-10 flex-wrap items-center gap-1.5 rounded-md border border-border-default bg-background-default px-2 py-1.5">
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
                    }
                  }}
                  onBlur={() => addTag(tagDraft)}
                  className="min-w-20 flex-1 bg-transparent text-sm outline-none"
                  placeholder={tags.length === 0 ? 'Add tag' : ''}
                />
              </div>
            </div>

            <label className="block space-y-2 text-sm" htmlFor={permalinkId}>
              <span className="font-medium text-text-default">Permalink</span>
              <input
                id={permalinkId}
                name="permalink"
                value={permalink}
                onChange={(event) => setPermalink(event.target.value)}
                className={TEXT_INPUT_CLASS}
                placeholder="custom-slug"
              />
            </label>
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="text-xs font-semibold uppercase tracking-wide text-text-subtle">Location</legend>
            <label className="block space-y-2 text-sm" htmlFor={folderId}>
              <span className="font-medium text-text-default">Folder</span>
              <select
                id={folderId}
                name="parentFolderId"
                value={parentFolderId}
                onChange={(event) => setParentFolderId(event.target.value)}
                className={TEXT_INPUT_CLASS}
              >
                <option value="" disabled>Choose a folder</option>
                {folderOptions.map((option) => (
                  <option key={option.id} value={option.id}>{option.label}</option>
                ))}
              </select>
            </label>
            <p className="text-xs leading-5 text-text-subtle">Move to Root is not enabled until the API clearing behavior is verified.</p>
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="text-xs font-semibold uppercase tracking-wide text-text-subtle">Permissions</legend>
            <label className="block space-y-2 text-sm" htmlFor={readPermissionId}>
              <span className="font-medium text-text-default">Read</span>
              <select
                id={readPermissionId}
                name="readPermission"
                value={readPermission}
                onChange={(event) => setReadPermission(event.target.value as NotePermissionRole)}
                className={TEXT_INPUT_CLASS}
              >
                <option value="owner">Owner</option>
                <option value="signed_in">Signed in</option>
                <option value="guest">Guest</option>
              </select>
            </label>
            <label className="block space-y-2 text-sm" htmlFor={writePermissionId}>
              <span className="font-medium text-text-default">Write</span>
              <select
                id={writePermissionId}
                name="writePermission"
                value={writePermission}
                onChange={(event) => setWritePermission(event.target.value as NotePermissionRole)}
                className={TEXT_INPUT_CLASS}
              >
                <option value="owner">Owner</option>
                <option value="signed_in">Signed in</option>
                <option value="guest">Guest</option>
              </select>
            </label>
          </fieldset>

          <button
            type="submit"
            disabled={!metadataDirty || isSaving}
            className={PRIMARY_BUTTON_CLASS}
          >
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save Metadata
          </button>
        </form>

        <form className="mt-6 space-y-3 border-t border-border-default pt-5" onSubmit={handleImageUpload}>
          <fieldset className="space-y-3">
            <legend className="text-xs font-semibold uppercase tracking-wide text-text-subtle">Images</legend>
            <label className="block space-y-2 text-sm" htmlFor={imageId}>
              <span className="font-medium text-text-default">Upload Image</span>
              <input
                id={imageId}
                name="image"
                type="file"
                accept="image/*"
                onChange={(event) => setImageFile(event.target.files?.[0] ?? null)}
                className="block w-full text-sm text-text-subtle file:mr-3 file:rounded-md file:border-0 file:bg-background-selected file:px-3 file:py-2 file:text-sm file:text-text-default hover:file:bg-border-default"
              />
            </label>
          </fieldset>
          <button
            type="submit"
            disabled={!imageFile || isUploading}
            className={SECONDARY_BUTTON_CLASS}
          >
            {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
            Upload and Insert
          </button>
        </form>
      </div>
    </aside>
  );
}
