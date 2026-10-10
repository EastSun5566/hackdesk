import { Profiler } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import type { ComponentProps } from 'react';

import type { ElectronActionContext } from '@/lib/electron-actions';
import type { FolderSummary, NoteSummary, TeamSummary } from '@/lib/electron-api';
import { buildHackmdFolderTree } from '@/lib/hackmd-folders';
import { HACKDESK_THEME_PRESETS } from '@/lib/themes';

import { CommandPaletteDialog } from '@/pages/electron-home/CommandPaletteDialog';

const context: ElectronActionContext = {
  activePaneTabCount: 1,
  activePaneTabsToRightCount: 0,
  canCreate: true,
  canModifySelectedFolder: true,
  editorMode: 'standard',
  hasToken: true,
  inspectorCollapsed: true,
  isSavingNote: false,
  navigationBackCount: 0,
  navigationForwardCount: 0,
  navigatorCollapsed: false,
  noteDirty: false,
  openTabCount: 1,
  paneCount: 1,
  recentlyClosedTabCount: 0,
  scopeType: 'personal',
  selectedFolderId: 'folder-alpha',
  selectedNoteId: 'exact',
  workspaceRailCollapsed: false,
};

const folder: FolderSummary = {
  clientId: null,
  color: null,
  createdAtMillis: 1,
  description: null,
  icon: null,
  id: 'folder-alpha',
  name: 'Alpha Folder',
  parentId: null,
  updatedAtMillis: 1,
};

const team: TeamSummary = {
  createdAtMillis: 1,
  description: null,
  id: 'team-alpha',
  logo: null,
  name: 'Alpha Team',
  ownerId: null,
  path: 'alpha-team',
  upgraded: false,
  visibility: 'private',
};

function note(input: Partial<NoteSummary> & Pick<NoteSummary, 'id' | 'title'>): NoteSummary {
  return {
    content: null,
    createdAtMillis: null,
    description: input.description ?? '',
    folderPaths: input.folderPaths ?? [],
    id: input.id,
    lastChangeUser: null,
    permalink: null,
    publishLink: '',
    publishedAtMillis: null,
    publishType: 'edit',
    readPermission: 'owner',
    shortId: input.shortId ?? input.id,
    tags: input.tags ?? [],
    tagsUpdatedAtMillis: null,
    teamPath: input.teamPath ?? null,
    title: input.title,
    titleUpdatedAtMillis: null,
    updatedAtMillis: input.updatedAtMillis ?? null,
    userPath: null,
    writePermission: 'owner',
    ...input,
  };
}

type CommandPaletteDialogProps = ComponentProps<typeof CommandPaletteDialog>;

function paletteProps(folderTree: CommandPaletteDialogProps['folderTree']) {
  const props: CommandPaletteDialogProps = {
    context,
    folderTree,
    onRunAction: () => {},
    onConnectHackmd: () => {},
    onCopyCurrentNoteLink: () => {},
    onCopyCurrentNoteMarkdownLink: () => {},
    onOpenLocalFolder: () => {},
    onRequestDisconnectHackmd: () => {},
    onShareCurrentNote: () => {},
    onSelectFolder: () => {},
    onSelectNote: () => {},
    onSelectRecentNote: () => {},
    onSelectWorkspace: () => {},
    onShowFinderResults: () => {},
    onStateChange: () => {},
    recentNotes: [
      {
        lastOpenedAtMillis: 500,
        noteId: 'exact',
        shortId: 'exact-short',
        teamPath: null,
        title: 'Alpha',
      },
      {
        lastOpenedAtMillis: 400,
        noteId: 'contains-recent',
        shortId: 'contains-recent',
        teamPath: null,
        title: 'Planning Alpha Ideas',
      },
    ],
    scope: { label: 'My Workspace', type: 'personal' },
    selectedFolderId: 'folder-alpha',
    selectedNoteId: 'exact',
    currentNoteIsRemote: true,
    hasCurrentNote: true,
    hasHackmdApiToken: true,
    hasLocalVault: true,
    platform: 'darwin',
    state: { mode: 'commands', open: true, search: '' },
    teams: [team],
    user: { name: 'Michael Lee', username: 'michael', photo: null },
    themeMode: 'system',
    themePresetId: 'hackmd-neo',
    themePresets: HACKDESK_THEME_PRESETS,
    onSelectThemeMode: () => {},
    onSelectThemePreset: () => {},
    onSwitchLocalVault: () => {},
  };

  return props;
}


const frames = () => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
const root = createRoot(document.getElementById('root')!);

async function measure(count: number) {
  const tree = buildHackmdFolderTree(Array.from({ length: count }, (_, index) => note({
    id: String(index), title: `Note ${index} project planning`, tags: ['project'],
    updatedAtMillis: index, folderPaths: [folder],
  })), [folder]);
  const props = paletteProps(tree);
  const rows = [];
  // One warmup, followed by five measured runs. Keep input references stable.
  for (let run = 0; run < 6; run++) {
    const samples = { closed: [] as number[], open: [] as number[], query: [] as number[] };
    let lastRender = 0;
    const commit = (open: boolean, search: string) => {
      lastRender = 0;
      flushSync(() => root.render(
        <Profiler id="palette" onRender={(_id, _phase, duration) => { lastRender += duration; }}>
          <CommandPaletteDialog {...props} state={{ mode: 'commands', open, search }} />
        </Profiler>,
      ));
      return lastRender;
    };
    commit(false, '');
    await frames();
    for (let index = 0; index < 30; index++) samples.closed.push(commit(false, ''));
    samples.open.push(commit(true, ''));
    await frames();
    for (let index = 0; index < 30; index++) {
      samples.query.push(commit(true, ['note', 'project', 'plan', 'not', 'planning', 'note 99'][index % 6]));
      await frames();
    }
    commit(false, '');
    await frames();
    if (run) rows.push(samples);
  }
  return { count, rows };
}

Object.assign(window, { paletteBenchmark: { measure } });
