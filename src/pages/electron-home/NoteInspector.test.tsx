import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TooltipProvider } from '@/components/ui/tooltip';
import type { DocumentSummary } from '@/lib/electron-api';
import { expectToolbarRovingFocus } from '@/test/accessibility-contracts';

import { LocalNoteInspector, NoteInspector } from './NoteInspector';

function documentSummary(overrides: Partial<DocumentSummary> = {}): DocumentSummary {
  return {
    content: '# Hello\n\nTwo words here.',
    createdAtMillis: null,
    description: 'Old description',
    folderPaths: [],
    id: 'note-1',
    lastChangeUser: null,
    permalink: null,
    publishLink: 'https://hackmd.io/note-1',
    publishedAtMillis: null,
    publishType: 'edit',
    readPermission: 'owner',
    shortId: 'note-1',
    tags: ['old'],
    tagsUpdatedAtMillis: null,
    teamPath: null,
    title: 'Hello',
    titleUpdatedAtMillis: null,
    updatedAtMillis: null,
    userPath: null,
    writePermission: 'owner',
    ...overrides,
  };
}

type NoteInspectorProps = Parameters<typeof NoteInspector>[0];

type NoteInspectorPropsOverrides = Partial<Omit<NoteInspectorProps, 'actions'>> & {
  actions?: Partial<NoteInspectorProps['actions']>;
};

function renderNoteInspector(overrides: NoteInspectorPropsOverrides = {}) {
  const document = overrides.document ?? documentSummary();
  const props: NoteInspectorProps = {
    actions: {
      onOpenNoteSettings: vi.fn(),
      onOpenShare: vi.fn(),
      onShowVersions: vi.fn(),
    },
    document,
  };
  const mergedProps: NoteInspectorProps = {
    ...props,
    ...overrides,
    actions: { ...props.actions, ...overrides.actions },
  };

  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <NoteInspector {...mergedProps} />
      </TooltipProvider>
    </QueryClientProvider>,
  );

  return { ...view, ...mergedProps };
}

describe('NoteInspector', () => {
  afterEach(() => {
    delete window.hackdeskAPI;
  });

  it('offers compact header icon actions for Note settings, Share note, and Version history', async () => {
    const onOpenNoteSettings = vi.fn();
    const onOpenShare = vi.fn();
    const onShowVersions = vi.fn();

    renderNoteInspector({
      actions: { onOpenNoteSettings, onOpenShare, onShowVersions },
    });

    await expectToolbarRovingFocus('Note details actions', [
      'Note settings',
      'Share note',
      'Version history',
    ]);

    fireEvent.click(screen.getByRole('button', { name: 'Note settings' }));
    fireEvent.click(screen.getByRole('button', { name: 'Share note' }));
    fireEvent.click(screen.getByRole('button', { name: 'Version history' }));

    expect(onOpenNoteSettings).toHaveBeenCalledOnce();
    expect(onOpenShare).toHaveBeenCalledOnce();
    expect(onShowVersions).toHaveBeenCalledOnce();
  });

  it('focuses the sidebar on comments, backlinks, and quiet note data without inline forms', () => {
    const { container } = renderNoteInspector({
      content: 'One two three four five',
      document: documentSummary({ readPermission: 'signed_in' }),
    });

    expect(container.querySelector('form')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Save changes' })).toBeNull();
    expect(screen.queryByLabelText('Description')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Permissions' })).toBeNull();

    const footer = container.querySelector('[data-inspector-note-data="true"]');
    expect(footer).toHaveTextContent('5 words · 1 min read');
    expect(footer).toHaveTextContent('Signed-in read · No date');
  });

  it('offers comments open by default only with a way to show them in the note', async () => {
    const listNoteComments = vi.fn(async () => ({ comments: [], page: 1, hasNext: false }));
    window.hackdeskAPI = { hackmd: { listNoteComments } } as unknown as NonNullable<typeof window.hackdeskAPI>;

    const { unmount } = renderNoteInspector();
    expect(screen.queryByRole('button', { name: /^Comments/ })).not.toBeInTheDocument();
    expect(listNoteComments).not.toHaveBeenCalled();
    unmount();

    renderNoteInspector({ actions: { onRevealComment: vi.fn(() => true) } });
    const commentsButton = screen.getByRole('button', { name: /^Comments/ });
    expect(commentsButton).toHaveAttribute('aria-pressed', 'true');
    expect(await screen.findByText('No comments on this note.')).toBeVisible();
    expect(commentsButton).toHaveTextContent('Comments (0)');
    expect(listNoteComments).toHaveBeenCalledWith('note-1', { page: 1 });
  });

  it('shows a LocalNoteInspector with backlinks and local note data footer', async () => {
    const backlinks = vi.fn(async () => ({ notes: [], hackmdIndexed: 0 }));
    window.hackdeskAPI = { getRuntimeEnvironment: () => 'electron', noteIndex: { backlinks } } as unknown as typeof window.hackdeskAPI;

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const localDoc = {
      ...documentSummary({ teamPath: '__hackdesk_local_vault__' }),
      localVaultId: 'vault-1',
      localRelativePath: 'note-1.md',
    };
    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <LocalNoteInspector
            content="Single"
            document={localDoc}
            onOpenNote={vi.fn()}
          />
        </TooltipProvider>
      </QueryClientProvider>,
    );

    expect(await screen.findByRole('heading', { name: /Linked from · 0/ })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Backlinks (0)' })).toBeVisible();
    expect(screen.getByText('No other notes link here.')).toBeVisible();
    const footer = container.querySelector('[data-inspector-note-data="true"]');
    expect(footer).toHaveTextContent('1 word · 1 min read');
    expect(footer).toHaveTextContent('Local file · No date');
  });
});

describe('NoteInspector Linked from', () => {
  afterEach(() => {
    delete window.hackdeskAPI;
  });

  function installBacklinks(notes: unknown[]) {
    const backlinks = vi.fn(async () => ({ notes, hackmdIndexed: 2 }));
    window.hackdeskAPI = { getRuntimeEnvironment: () => 'electron', noteIndex: { backlinks } } as unknown as typeof window.hackdeskAPI;
    return backlinks;
  }

  it('lists the notes that link here by default and opens them in their workspace', async () => {
    const backlinks = installBacklinks([{ kind: 'hackmd', noteId: 'long-2', teamPath: 'team-a', title: 'Roadmap', shortId: 'road', snippet: null }]);
    const onOpenNote = vi.fn();
    renderNoteInspector({ document: documentSummary({ permalink: 'hello', userPath: 'me' }), actions: { onOpenNote } });

    expect(await screen.findByRole('heading', { name: /Linked from · 1/ })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Backlinks (1)' })).toBeVisible();
    expect(backlinks).toHaveBeenCalledWith({
      target: { source: 'hackmd', id: 'note-1', shortId: 'note-1', permalink: 'hello', userPath: 'me', teamPath: null },
    });
    fireEvent.click(await screen.findByRole('button', { name: /Roadmap/ }));
    expect(onOpenNote).toHaveBeenCalledWith(expect.objectContaining({ noteId: 'long-2', teamPath: 'team-a', shortId: 'road', title: 'Roadmap' }));
  });

  it('says when nothing links here, and is hidden where notes cannot be opened', async () => {
    installBacklinks([]);
    const { unmount } = renderNoteInspector({ actions: { onOpenNote: vi.fn() } });
    expect(await screen.findByText('No other notes link here.')).toBeTruthy();
    unmount();

    renderNoteInspector();
    expect(screen.queryByRole('heading', { name: /Linked from/ })).toBeNull();
  });
});
