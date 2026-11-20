import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Toolbar } from '@/components/ui/toolbar';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { WindowPresentationState } from '@/lib/electron-api';
import { AltMenuBar, AppMenuButton, hasCustomWindowChrome, WindowControls } from './WindowChrome';

function installApi(state: WindowPresentationState = { fullScreen: false, maximized: false }) {
  let emit: (next: WindowPresentationState) => void = () => {};
  const app = {
    controlWindow: vi.fn(async () => {}),
    getMenuBar: vi.fn(async () => ['File', 'Edit', 'View']),
    popupMenu: vi.fn(async () => true),
    getWindowPresentationState: vi.fn(async () => state),
    onWindowPresentationStateChange: vi.fn((callback: (next: WindowPresentationState) => void) => {
      emit = callback;
      return vi.fn();
    }),
  };
  window.hackdeskAPI = { platform: 'linux', app } as unknown as NonNullable<typeof window.hackdeskAPI>;
  return { app, emit: (next: WindowPresentationState) => act(() => emit(next)) };
}

function wrapper({ children }: { children: ReactNode }) {
  return <TooltipProvider>{children}</TooltipProvider>;
}

function pressAlt() {
  fireEvent.keyDown(window, { key: 'Alt', altKey: true });
  fireEvent.keyUp(window, { key: 'Alt' });
}

afterEach(() => {
  delete window.hackdeskAPI;
  document.documentElement.removeAttribute('data-alt-menu-bar-open');
});

describe('hasCustomWindowChrome', () => {
  it('is on for Linux and Windows, where the window has no system frame', () => {
    expect(hasCustomWindowChrome('linux')).toBe(true);
    expect(hasCustomWindowChrome('win32')).toBe(true);
    expect(hasCustomWindowChrome('darwin')).toBe(false);
  });
});

describe('WindowControls', () => {
  it('minimizes, maximizes and closes the window', async () => {
    const { app } = installApi();
    render(<WindowControls />, { wrapper });

    fireEvent.click(screen.getByRole('button', { name: 'Minimize' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Maximize' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close window' }));

    expect(app.controlWindow.mock.calls).toEqual([['minimize'], ['toggle-maximize'], ['close']]);
  });

  it('offers Restore while maximized and follows later changes', async () => {
    const { emit } = installApi({ fullScreen: false, maximized: true });
    render(<WindowControls />, { wrapper });

    expect(await screen.findByRole('button', { name: 'Restore' })).toBeInTheDocument();
    emit({ fullScreen: false, maximized: false });
    expect(screen.getByRole('button', { name: 'Maximize' })).toBeInTheDocument();
  });

  it('is gone in full screen, like the system controls', async () => {
    const { emit } = installApi();
    render(<WindowControls />, { wrapper });

    expect(screen.getByRole('toolbar', { name: 'Window controls' })).toBeInTheDocument();
    emit({ fullScreen: true, maximized: false });
    await waitFor(() => {
      expect(screen.queryByRole('toolbar', { name: 'Window controls' })).not.toBeInTheDocument();
    });
  });
});

describe('AppMenuButton', () => {
  it('opens the whole app menu below itself', async () => {
    const { app } = installApi();
    render(<Toolbar><AppMenuButton /></Toolbar>, { wrapper });

    fireEvent.click(screen.getByRole('button', { name: 'Application menu' }));

    expect(app.popupMenu).toHaveBeenCalledWith({ section: null, x: 0, y: 0 });
  });
});

describe('AltMenuBar', () => {
  it('is hidden until Alt is pressed and released on its own', async () => {
    installApi();
    render(<AltMenuBar />);
    expect(screen.queryByRole('menubar')).not.toBeInTheDocument();

    // Alt as a modifier is a shortcut, not a request for the menu bar.
    fireEvent.keyDown(window, { key: 'Alt', altKey: true });
    fireEvent.keyDown(window, { key: 'f', altKey: true });
    fireEvent.keyUp(window, { key: 'Alt' });
    expect(screen.queryByRole('menubar')).not.toBeInTheDocument();

    pressAlt();
    const items = await screen.findAllByRole('menuitem');
    expect(items.map((item) => item.textContent)).toEqual(['File', 'Edit', 'View']);
    expect(items[0]).toHaveFocus();
    expect(document.documentElement).toHaveAttribute('data-alt-menu-bar-open');
  });

  it('moves with the arrow keys and opens the focused menu, then puts itself away', async () => {
    const { app } = installApi();
    render(<><input aria-label="Editor" /><AltMenuBar /></>);
    const editor = screen.getByRole('textbox', { name: 'Editor' });
    editor.focus();

    pressAlt();
    const [file] = await screen.findAllByRole('menuitem');
    fireEvent.keyDown(file, { key: 'ArrowLeft' });
    const view = screen.getByRole('menuitem', { name: 'View' });
    expect(view).toHaveFocus();
    fireEvent.keyDown(view, { key: 'ArrowRight' });
    expect(file).toHaveFocus();
    fireEvent.keyDown(file, { key: 'ArrowRight' });
    fireEvent.keyDown(screen.getByRole('menuitem', { name: 'Edit' }), { key: 'Enter' });

    expect(app.popupMenu).toHaveBeenCalledWith({ section: 1, x: 0, y: 0 });
    await waitFor(() => {
      expect(screen.queryByRole('menubar')).not.toBeInTheDocument();
    });
    expect(editor).toHaveFocus();
    expect(document.documentElement).not.toHaveAttribute('data-alt-menu-bar-open');
  });

  it('closes on Escape, on Alt again, and on a click elsewhere', async () => {
    installApi();
    render(<><button type="button">Elsewhere</button><AltMenuBar /></>);

    pressAlt();
    fireEvent.keyDown((await screen.findAllByRole('menuitem'))[0], { key: 'Escape' });
    expect(screen.queryByRole('menubar')).not.toBeInTheDocument();

    pressAlt();
    await screen.findByRole('menubar');
    pressAlt();
    expect(screen.queryByRole('menubar')).not.toBeInTheDocument();

    pressAlt();
    await screen.findByRole('menubar');
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Elsewhere' }));
    expect(screen.queryByRole('menubar')).not.toBeInTheDocument();
  });
});
