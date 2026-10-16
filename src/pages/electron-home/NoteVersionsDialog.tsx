import { useMemo, useState, type ReactNode } from 'react';
import { BookmarkPlus, FilePlus, History, Loader2, RotateCcw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/components/ui/toast';
import { getHackDeskAPI, type DocumentSummary, type NoteVersionSummary } from '@/lib/electron-api';
import { isNoteVersionsUnavailableError } from '@/lib/note-errors';

import {
  CURRENT_VERSION_ID,
  getVersionByline,
  getVersionTitle,
  NoteVersionList,
} from './NoteVersionList';
import { SaveVersionForm } from './SaveVersionForm';
import { formatDate } from './ui';
import { UnifiedDiffView } from './UnifiedDiffView';
import {
  getVersionErrorMessage,
  useNoteVersionContent,
  useNoteVersionDiff,
  useNoteVersionList,
} from './useNoteVersions';

type VersionTab = 'changes' | 'full';

async function confirmReplaceDraft() {
  const confirm = getHackDeskAPI()?.app.confirm;
  const options = {
    title: 'Replace Unsaved Changes',
    message: 'Replace your unsaved changes with this version?',
    detail: 'Your current edits in this note will be lost.',
    confirmLabel: 'Replace',
    cancelLabel: 'Cancel',
    destructive: true,
  };
  return confirm ? (await confirm(options)).confirmed : window.confirm(options.message);
}

function StatusMessage({ children, busy }: { children: ReactNode; busy?: boolean }) {
  return (
    <div role="status" aria-busy={busy || undefined} className="flex flex-1 items-center justify-center gap-2 px-4 py-10 text-center text-sm text-text-subtle">
      {busy ? <Loader2 aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" /> : null}
      {children}
    </div>
  );
}

function CurrentVersionPanel({ document, noteDirty }: { document: DocumentSummary; noteDirty: boolean }) {
  return (
    <div className="flex flex-col gap-2 text-sm">
      <h3 className="font-medium text-text-default">Current version on HackMD</h3>
      <p className="text-text-subtle">
        Last changed {formatDate(document.updatedAtMillis)}
        {document.lastChangeUser ? ` by ${document.lastChangeUser.name}` : ''}.
      </p>
      <p className="text-text-subtle">Choose a saved version to see what changed since then, or to bring it back.</p>
      {noteDirty ? <p className="text-text-subtle">Your unsaved edits are not part of HackMD&apos;s history yet.</p> : null}
    </div>
  );
}

function VersionPanel({
  noteId,
  version,
  noteDirty,
  tab,
  onTabChange,
}: {
  noteId: string;
  version: NoteVersionSummary;
  noteDirty: boolean;
  tab: VersionTab;
  onTabChange: (tab: VersionTab) => void;
}) {
  const diff = useNoteVersionDiff(noteId, version.id, tab === 'changes');
  const content = useNoteVersionContent(noteId, version.id, tab === 'full' && version.contentAvailable);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="min-w-0">
        <h3 className="truncate text-sm font-medium text-text-default">{getVersionTitle(version)}</h3>
        <p className="truncate text-xs text-text-subtle">{getVersionByline(version)}</p>
        {version.description ? <p className="mt-1 text-sm text-text-subtle">{version.description}</p> : null}
      </div>
      <Tabs value={tab} onValueChange={(value) => onTabChange(value as VersionTab)} className="flex min-h-0 flex-1 flex-col gap-2">
        <TabsList aria-label="Version view">
          <TabsTrigger value="changes">Changes</TabsTrigger>
          <TabsTrigger value="full" disabled={!version.contentAvailable}>Full text</TabsTrigger>
        </TabsList>
        <TabsContent value="changes" className="min-h-0 flex-1 overflow-y-auto">
          {noteDirty ? (
            <p className="mb-2 text-xs text-text-subtle">Compared with the note as last saved on HackMD, without your unsaved edits.</p>
          ) : null}
          {diff.isPending ? <StatusMessage busy>Comparing…</StatusMessage> : null}
          {diff.isError ? <StatusMessage>{getVersionErrorMessage(diff.error)}</StatusMessage> : null}
          {diff.data ? <UnifiedDiffView diff={diff.data.unifiedDiff} label={`Changes since ${getVersionTitle(version)}`} /> : null}
        </TabsContent>
        <TabsContent value="full" className="min-h-0 flex-1 overflow-y-auto">
          {content.isPending ? <StatusMessage busy>Loading version…</StatusMessage> : null}
          {content.isError ? <StatusMessage>{getVersionErrorMessage(content.error)}</StatusMessage> : null}
          {content.data ? (
            <pre className="whitespace-pre-wrap break-words rounded-md border border-border-default p-3 font-mono text-xs leading-5 text-text-default">
              {content.data.content}
            </pre>
          ) : null}
        </TabsContent>
      </Tabs>
    </div>
  );
}

type NoteVersionsDialogProps = {
  open: boolean;
  document: DocumentSummary;
  noteDirty: boolean;
  onOpenChange: (open: boolean) => void;
  onRestore: (content: string) => void;
  onOpenAsNewDraft: (title: string, content: string) => void;
};

export function NoteVersionsDialog({ open, onOpenChange, ...props }: NoteVersionsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg" className="gap-0 overflow-hidden p-0">
        {/* The popup unmounts when closed, so each opening starts fresh. */}
        <NoteVersionsBody {...props} onClose={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function NoteVersionsBody({
  document,
  noteDirty,
  onClose,
  onRestore,
  onOpenAsNewDraft,
}: Omit<NoteVersionsDialogProps, 'open' | 'onOpenChange'> & { onClose: () => void }) {
  const [namedOnly, setNamedOnly] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<VersionTab>('changes');
  const [savingVersion, setSavingVersion] = useState(false);
  const list = useNoteVersionList(document.id, namedOnly);
  const versions = useMemo(() => list.data?.pages.flatMap((page) => page.versions) ?? [], [list.data]);
  // Until something is picked, show the newest saved version.
  const effectiveId = selectedId ?? versions[0]?.id ?? CURRENT_VERSION_ID;
  const selectedVersion = versions.find((version) => version.id === effectiveId) ?? null;
  // Restoring needs the version's text even when the Full text tab was never opened.
  const content = useNoteVersionContent(document.id, selectedVersion?.id ?? null, !!selectedVersion?.contentAvailable);

  const select = (id: string) => {
    setSelectedId(id);
    setTab('changes');
  };
  const versionContent = content.data?.content ?? null;
  const versionTitle = selectedVersion ? getVersionTitle(selectedVersion) : '';

  const restore = async () => {
    if (versionContent === null) return;
    if (noteDirty && !(await confirmReplaceDraft())) return;
    onRestore(versionContent);
    onClose();
    toast.success(`Loaded “${versionTitle}” into the editor.`, { description: 'Save the note to keep it.' });
  };

  const openAsDraft = () => {
    if (versionContent === null) return;
    onOpenAsNewDraft(`${document.title || 'Untitled'} (${versionTitle})`, versionContent);
    onClose();
  };

  const listError = list.isError ? getVersionErrorMessage(list.error) : null;
  const versionsUnavailable = !!listError && isNoteVersionsUnavailableError(listError);

  const handleVersionSaved = (version: NoteVersionSummary) => {
    setSavingVersion(false);
    setSelectedId(version.id);
    setTab('changes');
    toast.success(`Saved version “${getVersionTitle(version)}”.`);
  };

  return (
    <>
      <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border-default py-4 pl-5 pr-14">
        <DialogHeader className="min-w-0">
          <DialogTitle className="flex items-center gap-2">
            <History aria-hidden="true" className="size-4" />
            Version History
          </DialogTitle>
          <DialogDescription className="truncate">{document.title || 'Untitled'}</DialogDescription>
        </DialogHeader>
        {versionsUnavailable || savingVersion ? null : (
          <Button size="sm" variant="secondary" onClick={() => setSavingVersion(true)}>
            <BookmarkPlus aria-hidden="true" className="size-4" />
            Save Version…
          </Button>
        )}
      </div>

      {savingVersion ? (
        <SaveVersionForm
          noteId={document.id}
          noteDirty={noteDirty}
          onSaved={handleVersionSaved}
          onCancel={() => setSavingVersion(false)}
        />
      ) : null}

      {listError ? (
        <StatusMessage>
          {versionsUnavailable ? listError : `Could not load version history. ${listError}`}
        </StatusMessage>
      ) : list.isPending ? (
        <StatusMessage busy>Loading versions…</StatusMessage>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-4 p-4 sm:flex-row">
          <NoteVersionList
            versions={versions}
            selectedId={effectiveId}
            currentDetail={formatDate(document.updatedAtMillis)}
            namedOnly={namedOnly}
            hasMore={!!list.hasNextPage}
            loadingMore={list.isFetchingNextPage}
            onSelect={select}
            onNamedOnlyChange={(value) => {
              setNamedOnly(value);
              setSelectedId(null);
            }}
            onLoadMore={() => void list.fetchNextPage()}
          />
          <section aria-label="Version details" className="flex min-h-0 min-w-0 flex-1 flex-col">
            {selectedVersion ? (
              <VersionPanel
                key={selectedVersion.id}
                noteId={document.id}
                version={selectedVersion}
                noteDirty={noteDirty}
                tab={tab}
                onTabChange={setTab}
              />
            ) : (
              <CurrentVersionPanel document={document} noteDirty={noteDirty} />
            )}
            {versions.length === 0 ? (
              <p className="mt-3 text-sm text-text-subtle">
                {namedOnly ? 'No named versions yet.' : 'HackMD has no saved versions of this note yet.'}
              </p>
            ) : null}
          </section>
        </div>
      )}

      <DialogFooter className="shrink-0 gap-2 border-t border-border-default px-5 py-3">
        <Button variant="secondary" disabled={versionContent === null} onClick={openAsDraft}>
          <FilePlus aria-hidden="true" className="size-4" />
          Open as New Draft
        </Button>
        <Button variant="primary" disabled={versionContent === null} onClick={() => void restore()}>
          <RotateCcw aria-hidden="true" className="size-4" />
          Restore into Editor
        </Button>
      </DialogFooter>
    </>
  );
}
