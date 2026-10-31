import { Copy } from 'lucide-react';
import { useId, useMemo } from 'react';

import type {
  DocumentSummary,
} from '@/lib/electron-api';
import type { FolderTree } from '@/lib/hackmd-folders';

import {
  LocationSection,
  MetadataSection,
  InspectorSaveFooter,
  PermissionsSection,
  VersionsSection,
} from './NoteInspectorSections';
import { PanelHeader, ToolbarIconButton } from './interaction-primitives';
import { BacklinksSection } from './NoteBacklinks';
import { CommentsSection } from './NoteComments';
import { useNoteInspectorForm, type NoteInspectorActions, type NoteInspectorStatus } from './useNoteInspectorForm';
import type { OpenNoteTarget } from './useNoteLinkOpener';

type NoteInspectorProps = {
  actions: NoteInspectorActions;
  document: DocumentSummary;
  folderTree: FolderTree;
  status: NoteInspectorStatus;
};

export function NoteInspector(props: NoteInspectorProps) {
  return <NoteInspectorPanel key={props.document.id} {...props} />;
}

function NoteInspectorPanel({
  actions,
  document,
  folderTree,
  status,
}: NoteInspectorProps) {
  const { locationIds, metadataIds, permissionsIds } = useNoteInspectorIds();
  const inspector = useNoteInspectorForm({ actions, document, folderTree });

  return (
    <aside
      aria-label="Note details"
      data-hackdesk-focus="inspector"
      tabIndex={-1}
      className="flex h-full w-80 flex-col bg-background-muted outline-none"
    >
      <InspectorHeader
        document={document}
        onCopyLink={actions.onCopyLink}
      />

      <form className="flex min-h-0 flex-1 flex-col" onSubmit={inspector.submit.metadata}>
        <div
          data-inspector-scroll-region="true"
          className="min-h-0 flex-1 scroll-py-3 overflow-auto overscroll-contain px-5 py-3 scrollbar-gutter-stable"
        >
          <MetadataSection
            dirty={inspector.dirty}
            dispatch={inspector.dispatch}
            ids={metadataIds}
            onAddTag={inspector.actions.addTag}
            onRemoveTag={inspector.actions.removeTag}
            state={inspector.state}
          />
          <LocationSection
            dirty={inspector.dirty.location}
            dispatch={inspector.dispatch}
            folderOptions={inspector.folderOptions}
            ids={locationIds}
            parentFolderId={inspector.state.parentFolderId}
          />
          <PermissionsSection
            dirty={inspector.dirty.permissions}
            dispatch={inspector.dispatch}
            ids={permissionsIds}
            readPermission={inspector.state.readPermission}
            writePermission={inspector.state.writePermission}
          />
          {actions.onShowVersions ? <VersionsSection noteId={document.id} onShowAll={actions.onShowVersions} /> : null}
          {actions.onOpenNote ? <BacklinksSection document={document} onOpenNote={actions.onOpenNote} /> : null}
          {actions.onRevealComment ? <CommentsSection noteId={document.id} onRevealComment={actions.onRevealComment} /> : null}
        </div>
        <InspectorSaveFooter
          dirty={inspector.dirty.metadata}
          saving={status.saving}
        />
      </form>
    </aside>
  );
}

/** A Local Vault note has no HackMD metadata, so its details are the notes linking to it. */
export function LocalNoteInspector({ document, onOpenNote }: { document: DocumentSummary; onOpenNote: OpenNoteTarget }) {
  return (
    <aside
      aria-label="Note details"
      data-hackdesk-focus="inspector"
      tabIndex={-1}
      className="flex h-full w-80 flex-col bg-background-muted outline-none"
    >
      <PanelHeader title="Note Details" className="px-4 py-2.5" />
      <div className="min-h-0 flex-1 overflow-auto overscroll-contain px-5 py-3 scrollbar-gutter-stable">
        <BacklinksSection key={document.id} document={document} onOpenNote={onOpenNote} defaultOpen />
      </div>
    </aside>
  );
}

function useNoteInspectorIds() {
  const descriptionId = useId();
  const permalinkId = useId();
  const tagsId = useId();
  const folderId = useId();
  const readPermissionId = useId();
  const writePermissionId = useId();

  return useMemo(() => ({
    metadataIds: {
      descriptionId,
      permalinkId,
      tagsId,
    },
    locationIds: {
      folderId,
    },
    permissionsIds: {
      readPermissionId,
      writePermissionId,
    },
  }), [
    descriptionId,
    folderId,
    permalinkId,
    readPermissionId,
    tagsId,
    writePermissionId,
  ]);
}

function InspectorHeader({
  document,
  onCopyLink,
}: {
  document: DocumentSummary;
  onCopyLink: (document: DocumentSummary) => void;
}) {
  return (
    <PanelHeader
      title="Note Details"
      className="px-4 py-2.5"
      actionsLabel="Note details actions"
      actions={(
        <ToolbarIconButton
          onClick={() => onCopyLink(document)}
          label="Copy Link"
        >
          <Copy aria-hidden="true" className="h-4 w-4" />
        </ToolbarIconButton>
      )}
    />
  );
}
