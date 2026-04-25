import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Agent } from './Agent';

const mocks = vi.hoisted(() => ({
  getCurrentWebviewWindow: vi.fn(),
  createEmptyAgentSession: vi.fn(),
  getCurrentNoteContext: vi.fn(),
  getPendingAgentLaunchIntent: vi.fn(),
  loadAgentSession: vi.fn(),
  saveAgentSession: vi.fn(),
  sendAgentMessage: vi.fn(),
}));

vi.mock('@tauri-apps/api/webviewWindow', () => ({
  getCurrentWebviewWindow: mocks.getCurrentWebviewWindow,
}));

vi.mock('@/lib/agent', () => ({
  clearAgentSession: vi.fn(),
  createAgentMessage: (role: 'user' | 'assistant', content: string) => ({
    id: `${role}-${content}`,
    role,
    content,
    createdAt: '2026-04-25T00:00:00.000Z',
  }),
  createEmptyAgentSession: mocks.createEmptyAgentSession,
  getCurrentNoteContext: mocks.getCurrentNoteContext,
  getPendingAgentLaunchIntent: mocks.getPendingAgentLaunchIntent,
  loadAgentSession: mocks.loadAgentSession,
  saveAgentSession: mocks.saveAgentSession,
  sendAgentMessage: mocks.sendAgentMessage,
}));

describe('Agent page', () => {
  const close = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    close.mockResolvedValue(undefined);

    mocks.getCurrentWebviewWindow.mockReturnValue({
      close,
    } as never);

    mocks.createEmptyAgentSession.mockReturnValue({
      id: 'empty-session',
      context: null,
      messages: [],
      updatedAt: '2026-04-25T00:00:00.000Z',
    } as never);

    mocks.getPendingAgentLaunchIntent.mockReturnValue('ask');

    mocks.loadAgentSession.mockReturnValue({
      id: 'session-1',
      context: null,
      messages: [],
      updatedAt: '2026-04-25T00:00:00.000Z',
    } as never);

    mocks.saveAgentSession.mockImplementation(() => undefined);

    mocks.getCurrentNoteContext.mockResolvedValue({
      url: 'https://hackmd.io/@team/example-note',
      path: '/@team/example-note',
      title: 'Example Note - HackMD',
      noteId: 'note-1',
      scope: 'personal-or-team',
      teamPath: '@team',
      isNote: true,
      reason: null,
      content: 'Important note body',
      contentReason: null,
    } as never);

    mocks.sendAgentMessage.mockResolvedValue('Agent answer');
  });

  it('submits the prompt with Command+Enter', async () => {
    render(<Agent />);

    const promptInput = await screen.findByLabelText('Ask About This Note');

    await waitFor(() => {
      expect(promptInput).toBeEnabled();
    });

    fireEvent.change(promptInput, {
      target: { value: 'Summarize this quickly' },
    });

    fireEvent.keyDown(promptInput, {
      key: 'Enter',
      metaKey: true,
    });

    await waitFor(() => {
      expect(mocks.sendAgentMessage).toHaveBeenCalledWith({
        prompt: 'Summarize this quickly',
        context: expect.objectContaining({
          noteId: 'note-1',
          isNote: true,
          title: 'Example Note - HackMD',
        }),
        intent: 'ask',
      });
    });

    expect(await screen.findByText('Agent answer')).toBeInTheDocument();
  });

  it('closes the window when the close button is clicked', async () => {
    render(<Agent />);

    await waitFor(() => {
      expect(screen.getByLabelText('Ask About This Note')).toBeEnabled();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Close note agent' }));

    expect(close).toHaveBeenCalled();
  });
});
