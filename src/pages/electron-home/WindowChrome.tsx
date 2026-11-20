import { Menu } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';

import { Toolbar } from '@/components/ui/toolbar';
import type { WindowControlAction, WindowPresentationState } from '@/lib/electron-api';
import { cn } from '@/lib/utils';
import { ToolbarIconButton } from './interaction-primitives';

/** Controls the Alt menu bar lies over, hidden while it is out so none peek past its end. */
export const ALT_MENU_BAR_COVERED_CLASS = '[[data-alt-menu-bar-open]_&]:invisible';

/**
 * Linux and Windows windows have no system frame: the title bar draws the window controls at its right
 * end and opens the app menu from a button or, as in VS Code, a menu bar that Alt reveals.
 */
export function hasCustomWindowChrome(platform: string) {
  return platform === 'linux' || platform === 'win32';
}

/** The window's full screen and maximized state, as the main process reports it. */
export function useWindowPresentationState(enabled = true): WindowPresentationState {
  const [state, setState] = useState<WindowPresentationState>({ fullScreen: false, maximized: false });

  useEffect(() => {
    const appApi = window.hackdeskAPI?.app;
    if (!enabled || !appApi?.getWindowPresentationState || !appApi.onWindowPresentationStateChange) {
      return;
    }

    let active = true;
    let receivedPresentationEvent = false;
    void appApi.getWindowPresentationState().then((next) => {
      if (active && !receivedPresentationEvent) setState(next);
    });
    const unsubscribe = appApi.onWindowPresentationStateChange((next) => {
      receivedPresentationEvent = true;
      setState(next);
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [enabled]);

  return state;
}

function controlWindow(action: WindowControlAction) {
  void window.hackdeskAPI?.app.controlWindow?.(action);
}

/** Thin 10px glyphs drawn on the pixel grid, like the system's own caption buttons. */
function WindowControlGlyph({ kind }: { kind: 'minimize' | 'maximize' | 'restore' | 'close' }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 10 10" className="size-2.5" fill="none" stroke="currentColor" strokeWidth="1">
      {kind === 'minimize' ? <path d="M0 5.5h10" /> : null}
      {kind === 'maximize' ? <rect x="0.5" y="0.5" width="9" height="9" rx="1" /> : null}
      {kind === 'restore' ? (
        <>
          <rect x="0.5" y="2.5" width="7" height="7" rx="1" />
          <path d="M2.5 2.5v-1a1 1 0 0 1 1-1h5a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-1" />
        </>
      ) : null}
      {kind === 'close' ? <path d="M0.5 0.5l9 9M9.5 0.5l-9 9" /> : null}
    </svg>
  );
}

/**
 * Minimize, maximize (restore while maximized) and close, at the right end of the top row of the
 * title bar. A full screen window has none, as on macOS. They stay visible in Hack Mode, which hides
 * the rest of the chrome, since the window has no other close button.
 */
export function WindowControls({ className }: { className?: string }) {
  const { fullScreen, maximized } = useWindowPresentationState();
  if (fullScreen) return null;

  const buttonClassName = 'app-topbar-button app-region-no-drag h-7 w-8 shrink-0';
  return (
    <Toolbar
      aria-label="Window controls"
      data-window-controls=""
      className={cn('ml-1 shrink-0 [[data-hack-mode]_&]:visible!', className)}
    >
      <ToolbarIconButton label="Minimize" variant="window-control" className={buttonClassName} onClick={() => controlWindow('minimize')}>
        <WindowControlGlyph kind="minimize" />
      </ToolbarIconButton>
      <ToolbarIconButton
        label={maximized ? 'Restore' : 'Maximize'}
        variant="window-control"
        className={buttonClassName}
        onClick={() => controlWindow('toggle-maximize')}
      >
        <WindowControlGlyph kind={maximized ? 'restore' : 'maximize'} />
      </ToolbarIconButton>
      <ToolbarIconButton
        label="Close window"
        tooltip="Close"
        variant="window-close"
        className={buttonClassName}
        onClick={() => controlWindow('close')}
      >
        <WindowControlGlyph kind="close" />
      </ToolbarIconButton>
    </Toolbar>
  );
}

function popupMenuBelow(element: HTMLElement, section: number | null) {
  const rect = element.getBoundingClientRect();
  return window.hackdeskAPI?.app.popupMenu?.({
    section,
    x: Math.max(0, Math.round(rect.left)),
    y: Math.max(0, Math.round(rect.bottom)),
  }) ?? Promise.resolve(false);
}

/** The app menu, all of it, from the title bar's leading corner (where macOS has its traffic lights). */
export function AppMenuButton() {
  return (
    <ToolbarIconButton
      label="Application menu"
      tooltip="Menu (Alt shows the menu bar)"
      aria-haspopup="menu"
      variant="icon-topbar"
      className="app-topbar-button app-region-no-drag h-7 w-7 shrink-0"
      onClick={(event) => {
        void popupMenuBelow(event.currentTarget, null);
      }}
    >
      <Menu aria-hidden="true" className="size-4.5" />
    </ToolbarIconButton>
  );
}

/**
 * Pressing and releasing Alt on its own toggles the menu bar, as in VS Code and native Windows apps.
 * Alt used with another key, or a click while it is held, is a shortcut and leaves it alone.
 */
function useLoneAltToggle(onToggle: () => void) {
  const armed = useRef(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      armed.current = event.key === 'Alt' && !event.repeat && !event.ctrlKey && !event.metaKey && !event.shiftKey;
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === 'Alt' && armed.current) {
        event.preventDefault();
        onToggle();
      }
      armed.current = false;
    };
    const disarm = () => {
      armed.current = false;
    };
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', onKeyUp, true);
    window.addEventListener('pointerdown', disarm, true);
    window.addEventListener('blur', disarm);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('keyup', onKeyUp, true);
      window.removeEventListener('pointerdown', disarm, true);
      window.removeEventListener('blur', disarm);
    };
  }, [onToggle]);
}

/**
 * The menu bar, hidden until Alt. It lies over the start of the title bar, after the menu button, and
 * each entry opens that menu natively, so items, shortcuts and checkmarks always match the app menu.
 * Arrow keys move between entries; Enter, Space or Down opens one; Escape, Alt or a click elsewhere
 * puts the bar away and returns focus to where it was.
 */
export function AltMenuBar() {
  const [labels, setLabels] = useState<string[] | null>(null);
  const items = useRef<(HTMLButtonElement | null)[]>([]);
  const bar = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const open = labels !== null;

  const close = useCallback(() => {
    setLabels(null);
    const target = returnFocus.current;
    returnFocus.current = null;
    if (target?.isConnected) target.focus();
  }, []);

  const toggle = useCallback(() => {
    if (open) {
      close();
      return;
    }
    const getMenuBar = window.hackdeskAPI?.app.getMenuBar;
    if (!getMenuBar) return;
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    void getMenuBar().then((next) => {
      if (next.length > 0) setLabels(next);
    });
  }, [close, open]);

  useLoneAltToggle(toggle);

  useEffect(() => {
    if (!open) return;
    // The bar takes the place of the sidebar's title bar controls while it is out (ALT_MENU_BAR_COVERED_CLASS).
    document.documentElement.toggleAttribute('data-alt-menu-bar-open', true);
    items.current[0]?.focus();
    const onPointerDown = (event: PointerEvent) => {
      if (!bar.current?.contains(event.target as Node)) close();
    };
    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('blur', close);
    return () => {
      document.documentElement.removeAttribute('data-alt-menu-bar-open');
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('blur', close);
    };
  }, [close, open]);

  if (!labels) return null;

  const openSection = (index: number) => {
    const item = items.current[index];
    if (!item) return;
    void popupMenuBelow(item, index).then(close);
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>, index: number) => {
    const move = (next: number) => {
      event.preventDefault();
      items.current[(next + labels.length) % labels.length]?.focus();
    };
    if (event.key === 'ArrowRight') move(index + 1);
    else if (event.key === 'ArrowLeft') move(index - 1);
    else if (event.key === 'Home') move(0);
    else if (event.key === 'End') move(labels.length - 1);
    else if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openSection(index);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      close();
    }
  };

  return (
    <div
      ref={bar}
      role="menubar"
      aria-label="Menu bar"
      data-alt-menu-bar=""
      className="app-region-no-drag fixed top-0 left-10 z-50 flex h-10 items-center gap-0.5 rounded-br-lg bg-background-muted pr-1.5"
    >
      {labels.map((label, index) => (
        <button
          key={`${index}-${label}`}
          ref={(element) => {
            items.current[index] = element;
          }}
          type="button"
          role="menuitem"
          aria-haspopup="menu"
          tabIndex={index === 0 ? 0 : -1}
          className="h-7 rounded-md px-2.5 text-sm text-text-default hover:bg-background-hover focus-visible:bg-background-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
          onClick={() => openSection(index)}
          onKeyDown={(event) => onKeyDown(event, index)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
