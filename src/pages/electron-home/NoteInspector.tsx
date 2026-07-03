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
} from './NoteInspectorSections';
import { PanelHeader, ToolbarIconButton } from './interaction-primitives';
import { useNoteInspectorForm, type NoteInspectorActions, type NoteInspectorStatus } from './useNoteInspectorForm';

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
          className="min-h-0 flex-1 overflow-auto overscroll-contain px-4 py-3"
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
        </div>
        <InspectorSaveFooter
          dirty={inspector.dirty.metadata}
          saving={status.saving}
        />
      </form>
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
      title="Inspector"
      className="px-4 py-2.5"
      actionsLabel="Inspector actions"
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
