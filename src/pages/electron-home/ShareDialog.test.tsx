import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { DocumentSummary } from '@/lib/electron-api';

import { ShareDialog } from './ShareDialog';

function createDocument(overrides: Partial<DocumentSummary> = {}): DocumentSummary {
  return {
    content: '# Hello',
    createdAtMillis: null,
    description: '',
    folderPaths: [],
    id: 'note-1',
    lastChangeUser: null,
    permalink: null,
    publishLink: 'https://hackmd.io/note-1',
    publishedAtMillis: null,
    publishType: 'edit',
    readPermission: 'owner',
    shortId: 'note-1',
    tags: [],
    tagsUpdatedAtMillis: null,
    teamPath: null,
    title: 'Hello',
    titleUpdatedAtMillis: null,
    updatedAtMillis: null,
    userPath: 'me',
    writePermission: 'owner',
    ...overrides,
  };
}

function renderShareDialog({
  document = createDocument(),
  isSaving = false,
  onCopyLink = vi.fn(),
  onCopyMarkdownLink = vi.fn(),
  onOpenEditor = vi.fn(),
  onSaveSharing = vi.fn(),
} = {}) {
  const { unmount } = render(
    <ShareDialog
      open
      document={document}
      isSaving={isSaving}
      onOpenChange={vi.fn()}
      onCopyLink={onCopyLink}
      onCopyMarkdownLink={onCopyMarkdownLink}
      onOpenEditor={onOpenEditor}
      onSaveSharing={onSaveSharing}
    />,
  );

  return { document, onCopyLink, onCopyMarkdownLink, onOpenEditor, onSaveSharing, unmount };
}

describe('ShareDialog', () => {
  it('renders Access and Links sections with explicit link copy and open actions', () => {
    const { document, onCopyLink, onCopyMarkdownLink, onOpenEditor } = renderShareDialog();

    expect(screen.getByRole('heading', { name: 'Access' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Links' })).toBeVisible();
    expect(screen.getByText('hackmd.io/@me/')).toBeVisible();
    expect(screen.getByLabelText('HackMD link')).toHaveValue('https://hackmd.io/@me/note-1');
    expect(screen.getByLabelText('Markdown link')).toHaveValue('[Hello](https://hackmd.io/@me/note-1)');

    fireEvent.click(screen.getByRole('button', { name: 'Copy HackMD link' }));
    expect(screen.getByRole('button', { name: 'Copy HackMD link' })).toHaveTextContent('Copied');
    fireEvent.click(screen.getByRole('button', { name: 'Copy Markdown link' }));
    expect(screen.getByRole('button', { name: 'Copy Markdown link' })).toHaveTextContent('Copied');
    fireEvent.click(screen.getByRole('button', { name: 'Open in HackMD' }));

    expect(onCopyLink).toHaveBeenCalledWith(document);
    expect(onCopyMarkdownLink).toHaveBeenCalledWith(document);
    expect(onOpenEditor).toHaveBeenCalledWith(document);
  });

  it('saves segmented Access permission and Permalink changes together', () => {
    const onSaveSharing = vi.fn();
    const { document } = renderShareDialog({ onSaveSharing });

    const readGroup = screen.getByRole('radiogroup', { name: 'Read access' });
    const writeGroup = screen.getByRole('radiogroup', { name: 'Write access' });

    fireEvent.click(within(readGroup).getByRole('radio', { name: 'Public' }));
    fireEvent.click(within(writeGroup).getByRole('radio', { name: 'Signed in' }));
    fireEvent.change(screen.getByLabelText('Permalink'), { target: { value: 'custom-roadmap' } });

    expect(screen.getByText('Unsaved sharing changes')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    expect(onSaveSharing).toHaveBeenCalledWith(document, {
      readPermission: 'guest',
      writePermission: 'signed_in',
      permalink: 'custom-roadmap',
    });
  });

  it('uses native disabled and reduced-motion-safe saving states', () => {
    const { unmount } = renderShareDialog();

    expect(screen.getByRole('button', { name: 'Save Changes' })).toBeDisabled();
    expect(screen.getByText('All sharing settings saved')).toBeVisible();

    unmount();
    renderShareDialog({ isSaving: true });

    const savingButton = screen.getByRole('button', { name: 'Saving…' });
    expect(savingButton).toBeDisabled();
    expect(savingButton.querySelector('.animate-spin')).toHaveClass('motion-reduce:animate-none');
    expect(screen.getByText('Saving sharing settings…')).toBeVisible();
  });
});
