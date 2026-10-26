import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { DocumentSummary } from '@/lib/electron-api';
import { ConflictComparison } from './ConflictComparison';

vi.mock('@/components/NoteComparisonView', () => ({ NoteComparisonView: ({ input }: { input: { before: string; after: string } }) => <div>{input.before} → {input.after}</div> }));

const document = { id: 'note', title: 'Cached title', content: 'Cached content', teamPath: null } as DocumentSummary;

describe('conflict comparison', () => {
  it('reads fresh content independently and retries failures without changing the draft', async () => {
    const readSource = vi.fn().mockRejectedValueOnce(new Error('Offline. Your draft is kept.')).mockResolvedValue({ title: 'Latest', content: 'Fresh content' });
    const onClose = vi.fn();
    render(<ConflictComparison document={document} draftTitle="Draft title" draftContent="My draft" source="HackMD" onClose={onClose} readSource={readSource} />);
    expect(await screen.findByRole('status')).toHaveTextContent('Offline');
    expect(screen.queryByText('Cached content')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Fresh content → My draft')).toBeInTheDocument();
    expect(screen.getByText(/Read from HackMD at/)).toBeInTheDocument();
    expect(screen.getByText('Latest')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(readSource).toHaveBeenCalledTimes(2);
  });

  it('aborts on close and ignores late responses from the previous note', async () => {
    let resolve!: (value: { title: string; content: string }) => void;
    const readSource = vi.fn((_note, _signal: AbortSignal) => new Promise<{ title: string; content: string }>((done) => { resolve = done; }));
    const props = { document, draftTitle: 'Draft', draftContent: 'Draft', source: 'disk', onClose: vi.fn() };
    const view = render(<ConflictComparison {...props} readSource={readSource} />);
    await waitFor(() => expect(readSource).toHaveBeenCalledOnce());
    const signal = readSource.mock.calls[0][1];
    view.unmount();
    expect(signal.aborted).toBe(true);
    render(<ConflictComparison {...props} document={{ ...document, id: 'new-note' }} readSource={async () => ({ title: 'New note', content: 'New content' })} />);
    resolve({ title: 'Previous note', content: 'Stale content' });
    expect(await screen.findByText('New content → Draft')).toBeInTheDocument();
    expect(screen.queryByText(/Stale content/)).not.toBeInTheDocument();
  });
});
