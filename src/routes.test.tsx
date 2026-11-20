import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import AppRoutes from './routes';

// The workbench and the popup are stand-ins: this file is about how the routes load them.
let resolveHome: (() => void) | null = null;
const homeLoaded = new Promise<void>((resolve) => {
  resolveHome = resolve;
});
const homeImported = vi.fn();

vi.mock('./pages/Home', async () => {
  homeImported();
  await homeLoaded;
  return { Home: () => <div>Workbench</div> };
});

vi.mock('./pages/QuickCapture', () => ({
  QuickCapture: () => <div>Quick Hack</div>,
}));

function renderRoute(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
    </MemoryRouter>,
  );
}

describe('AppRoutes', () => {
  it('renders Quick Hack without loading the workbench', () => {
    const { unmount } = renderRoute('/quick-capture');

    expect(screen.getByText('Quick Hack')).toBeInTheDocument();
    expect(homeImported).not.toHaveBeenCalled();
    expect(document.body.className).toBe('quick-capture-screen');
    unmount();
  });

  it('paints the workbench frame while the workbench loads', async () => {
    renderRoute('/electron');

    const fallback = screen.getByTestId('home-loading');
    expect(fallback).toHaveClass('app-chrome', 'bg-(--background-chrome)');
    expect(fallback).toHaveAttribute('aria-hidden', 'true');
    expect(screen.queryByText('Workbench')).not.toBeInTheDocument();

    resolveHome?.();
    expect(await screen.findByText('Workbench')).toBeInTheDocument();
    expect(screen.queryByTestId('home-loading')).not.toBeInTheDocument();
  });
});
