import type { ComponentProps } from 'react';

import { AppTopBar } from './AppTopBar';
import { DocumentWorkspace } from './DocumentWorkspace';
import { FolderNavigator } from './FolderNavigator';
import type { NoteWorkspaceState } from './note-workspace';
import { PanelResizeSash } from './PanelResizeSash';
import { NAVIGATOR_WIDTH_DEFAULT, NAVIGATOR_WIDTH_MAX, NAVIGATOR_WIDTH_MIN } from './ui-preferences';
import { WorkspaceBackupNotice, type WorkspaceBackupNoticeProps } from './WorkspaceBackupNotice';
import { WorkspaceNavigationProvider, type WorkspaceNavigation } from './WorkspaceNavigationContext';
import { WorkbenchDocumentActionsProvider, type WorkbenchDocumentActions } from './DocumentActionsContext';

export const NOTE_NAVIGATOR_PANEL_ID = 'note-navigator-panel';

type FolderNavigatorProps = ComponentProps<typeof FolderNavigator>;

export type ElectronHomeWorkspaceProps = {
  backupNotice?: WorkspaceBackupNoticeProps | null;
  documentWorkspace: ComponentProps<typeof DocumentWorkspace>;
  /** What the panes do to their notes: save, delete, copy a link, upload an image. */
  documentActions: WorkbenchDocumentActions;
  navigator: Omit<FolderNavigatorProps, 'id'>;
  /** The workspace switcher in the sidebar title and the account row at its bottom. */
  workspaceNavigation: WorkspaceNavigation;
  navigatorResize: {
    disabled: boolean;
    value: number;
    onChange: (value: number) => void;
  };
  titlebar: {
    layout: {
      navigatorCollapsed: boolean;
    };
    state: Pick<NoteWorkspaceState, 'backStack' | 'forwardStack' | 'panes' | 'zoomedPaneId'>;
    actions: {
      navigateBack: () => void;
      navigateForward: () => void;
      togglePaneZoom: () => void;
      equalizePanes: () => void;
      toggleNavigator: () => void;
    };
  };
};

export function ElectronHomeWorkspace({
  backupNotice,
  documentWorkspace,
  documentActions,
  navigator,
  workspaceNavigation,
  navigatorResize,
  titlebar,
}: ElectronHomeWorkspaceProps) {
  return (
    <>
      <AppTopBar
        navigation={{
          canGoBack: titlebar.state.backStack.length > 0,
          canGoForward: titlebar.state.forwardStack.length > 0,
          onBack: titlebar.actions.navigateBack,
          onForward: titlebar.actions.navigateForward,
        }}
        paneLayout={{
          paneCount: titlebar.state.panes.length,
          zoomed: Boolean(titlebar.state.zoomedPaneId),
          onToggleZoom: titlebar.actions.togglePaneZoom,
          onEqualize: titlebar.actions.equalizePanes,
        }}
        platform={window.hackdeskAPI?.platform ?? 'unknown'}
        navigatorCollapsed={titlebar.layout.navigatorCollapsed}
        navigatorPanelId={NOTE_NAVIGATOR_PANEL_ID}
        onToggleNavigator={titlebar.actions.toggleNavigator}
      />

      {backupNotice ? <WorkspaceBackupNotice {...backupNotice} /> : null}

      {/* Notes sit on cards a gap in from the window; the sidebar's resize handle is the gap beside it. */}
      {/* The gap left of the card while the sidebar is collapsed is the sidebar's own margin, so it
          grows as the sidebar narrows instead of shoving the sidebar aside the moment it starts. */}
      <main className="flex min-h-0 min-w-0 flex-1 pr-1.5 pb-1.5 [[data-hack-mode]_&]:p-0">
        <WorkspaceNavigationProvider value={workspaceNavigation}>
          <FolderNavigator id={NOTE_NAVIGATOR_PANEL_ID} {...navigator} />
        </WorkspaceNavigationProvider>
        <PanelResizeSash
          label="Resize sidebar"
          value={navigatorResize.value}
          min={NAVIGATOR_WIDTH_MIN}
          max={NAVIGATOR_WIDTH_MAX}
          defaultValue={NAVIGATOR_WIDTH_DEFAULT}
          disabled={navigatorResize.disabled}
          onChange={navigatorResize.onChange}
          collapseThreshold={NAVIGATOR_WIDTH_MIN - 90}
          onCollapse={titlebar.actions.toggleNavigator}
          previewTargetId={NOTE_NAVIGATOR_PANEL_ID}
          edge
          previewProperties={['--panel-width', '--sidebar-content-width']}
        />

        <WorkbenchDocumentActionsProvider value={documentActions}>
          <DocumentWorkspace {...documentWorkspace} />
        </WorkbenchDocumentActionsProvider>
      </main>
    </>
  );
}
