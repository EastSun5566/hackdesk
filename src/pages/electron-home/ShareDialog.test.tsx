import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { DocumentSummary } from '@/lib/electron-api';

import { ShareDialog } from './ShareDialog';

const document: DocumentSummary = {
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
  userPath: null,
  writePermission: 'owner',
};

async function selectOption(label: string, optionName: string) {
  const trigger = screen.getByRole('combobox', { name: label });
  fireEvent.pointerDown(trigger);
  fireEvent.click(trigger);
  const option = await screen.findByRole('option', { name: optionName });
  fireEvent.pointerDown(option);
  fireEvent.click(option);
}

function renderShareDialog({
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

  return { onCopyLink, onCopyMarkdownLink, onOpenEditor, onSaveSharing, unmount };
}

describe('ShareDialog', () => {
  it('keeps link actions explicit while using compact labeled rows', () => {
    const { onCopyLink, onCopyMarkdownLink, onOpenEditor } = renderShareDialog();

    expect(screen.getByRole('heading', { name: 'Links' })).toBeVisible();
    expect(screen.getByLabelText('HackMD link')).toHaveValue('https://hackmd.io/note-1');
    expect(screen.getByLabelText('Markdown link')).toHaveValue('[Hello](https://hackmd.io/note-1)');

    fireEvent.click(screen.getByRole('button', { name: 'Copy HackMD link' }));
    fireEvent.click(screen.getByRole('button', { name: 'Copy Markdown link' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open in HackMD' }));

    expect(onCopyLink).toHaveBeenCalledWith(document);
    expect(onCopyMarkdownLink).toHaveBeenCalledWith(document);
    expect(onOpenEditor).toHaveBeenCalledWith(document);
  });

  it('shows permission labels while preserving raw values in the save payload', async () => {
    const onSaveSharing = vi.fn();
    renderShareDialog({ onSaveSharing });
    const readTrigger = screen.getByRole('combobox', { name: 'Read Access' });
    const writeTrigger = screen.getByRole('combobox', { name: 'Write Access' });

    expect(screen.getByRole('heading', { name: 'Access' })).toBeVisible();
    expect(readTrigger).toHaveTextContent('Private');
    expect(readTrigger).not.toHaveTextContent('owner');
    expect(writeTrigger).toHaveTextContent('Owner only');
    expect(screen.queryByText(/Current sharing:/)).not.toBeInTheDocument();

    await selectOption('Read Access', 'Public');
    await selectOption('Write Access', 'Anyone with the link');

    expect(screen.getByRole('combobox', { name: 'Read Access' })).toHaveTextContent('Public');
    expect(screen.getByRole('combobox', { name: 'Write Access' })).toHaveTextContent('Anyone with the link');

    fireEvent.click(screen.getByRole('button', { name: 'Save Access' }));

    expect(onSaveSharing).toHaveBeenCalledWith(document, {
      readPermission: 'guest',
      writePermission: 'guest',
    });
  });

  it('uses native disabled and reduced-motion-safe saving states', () => {
    const { unmount } = renderShareDialog();

    expect(screen.getByRole('button', { name: 'Save Access' })).toBeDisabled();

    unmount();
    renderShareDialog({ isSaving: true });

    const savingButton = screen.getByRole('button', { name: 'Saving…' });
    expect(savingButton).toBeDisabled();
    expect(savingButton.querySelector('.animate-spin')).toHaveClass('motion-reduce:animate-none');
  });
});
