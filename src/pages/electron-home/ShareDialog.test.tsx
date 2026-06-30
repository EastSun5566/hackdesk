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

function renderShareDialog(onSaveSharing = vi.fn()) {
  render(
    <ShareDialog
      open
      document={document}
      isSaving={false}
      onOpenChange={vi.fn()}
      onCopyLink={vi.fn()}
      onCopyMarkdownLink={vi.fn()}
      onOpenEditor={vi.fn()}
      onSaveSharing={onSaveSharing}
    />,
  );

  return { onSaveSharing };
}

describe('ShareDialog', () => {
  it('shows permission labels while preserving raw values in the save payload', async () => {
    const { onSaveSharing } = renderShareDialog();
    const readTrigger = screen.getByRole('combobox', { name: 'Read Access' });
    const writeTrigger = screen.getByRole('combobox', { name: 'Write Access' });

    expect(readTrigger).toHaveTextContent('Private');
    expect(readTrigger).not.toHaveTextContent('owner');
    expect(writeTrigger).toHaveTextContent('Owner only');

    await selectOption('Read Access', 'Public');
    await selectOption('Write Access', 'Anyone with the link');

    expect(screen.getByRole('combobox', { name: 'Read Access' })).toHaveTextContent('Public');
    expect(screen.getByRole('combobox', { name: 'Write Access' })).toHaveTextContent('Anyone with the link');

    fireEvent.click(screen.getByRole('button', { name: 'Save Sharing' }));

    expect(onSaveSharing).toHaveBeenCalledWith(document, {
      readPermission: 'guest',
      writePermission: 'guest',
    });
  });
});
