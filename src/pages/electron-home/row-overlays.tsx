import { Menu } from '@base-ui/react/menu';
import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FocusEvent as ReactFocusEvent,
  type MutableRefObject,
  type PointerEvent as ReactPointerEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type RefCallback,
} from 'react';

import { ContextMenuContent } from '@/components/ui/context-menu';
import { TooltipContent, TooltipRoot } from '@/components/ui/tooltip';

import { NOTE_CARD_CLASS } from './NoteSummaryCard';

/**
 * Row context menus and hover cards, one of each per list instead of one per row.
 *
 * A Base UI menu or tooltip root costs a few milliseconds to mount, and each one joins stores the
 * others listen to, so a folder of 40 notes opened beside 2,000 already-mounted rows took a quarter
 * of a second. Rows instead register what their menu and card show; the host finds the row an event
 * came from and opens its one menu or card there. A row is then a plain element, cheap to mount.
 */

interface RowOverlays {
  /** The row's context menu items, built when the menu opens. */
  menu: (() => ReactNode) | null;
  /** The row's hover card, built when the card opens. Note rows are the ones with cards. */
  card: (() => ReactNode) | null;
}

type Registry = WeakMap<Element, MutableRefObject<RowOverlays>>;

const RowOverlayRegistryContext = createContext<Registry | null>(null);

/** Hover cards open after the pointer rests on a row this long, as the per-row tooltips did. */
const CARD_DELAY_MS = 300;

/**
 * Registers a row's menu and hover card with the nearest RowOverlayHost. Returns a ref for the row's
 * outer element; events anywhere inside it reach that row's menu and card. Without a host (a drag
 * preview, a test rendering one row), it does nothing.
 */
export function useRowOverlays(menu: RowOverlays['menu'], card: RowOverlays['card'] = null): RefCallback<HTMLElement> {
  const registry = useContext(RowOverlayRegistryContext);
  const overlays = useRef<RowOverlays>({ menu, card });
  // Read when a menu or card opens, so it shows the row's props at that moment.
  useLayoutEffect(() => {
    overlays.current = { menu, card };
  });
  return useCallback((element: HTMLElement | null) => {
    if (element && registry) registry.set(element, overlays);
  }, [registry]);
}

function registeredRow(registry: Registry, target: EventTarget | null, boundary: Element): HTMLElement | null {
  for (let element = target instanceof Element ? target : null; element && element !== boundary; element = element.parentElement) {
    if (registry.has(element)) return element as HTMLElement;
  }
  return null;
}

/** A zero-size point for the menu to open at. */
function pointAnchor(x: number, y: number) {
  return { getBoundingClientRect: () => DOMRect.fromRect({ x, y, width: 0, height: 0 }) };
}

interface MenuState {
  open: boolean;
  anchor: ReturnType<typeof pointAnchor> | null;
  row: HTMLElement | null;
  items: (() => ReactNode) | null;
}

interface CardState {
  open: boolean;
  anchor: HTMLElement | null;
  card: (() => ReactNode) | null;
}

const CLOSED_MENU: MenuState = { open: false, anchor: null, row: null, items: null };
const CLOSED_CARD: CardState = { open: false, anchor: null, card: null };

/**
 * Hosts the context menu and hover card for the rows inside it. Renders no box of its own
 * (display: contents), so it never changes the layout around the rows.
 */
export function RowOverlayHost({ children }: { children: ReactNode }) {
  const registry = useMemo<Registry>(() => new WeakMap(), []);
  const [menu, setMenu] = useState<MenuState>(CLOSED_MENU);
  const [card, setCard] = useState<CardState>(CLOSED_CARD);
  const cardOpen = useRef(false);
  cardOpen.current = card.open;
  const hoveredRow = useRef<HTMLElement | null>(null);
  const cardTimer = useRef<number | undefined>(undefined);

  const closeCard = useCallback(() => {
    window.clearTimeout(cardTimer.current);
    setCard((current) => (current.open ? { ...current, open: false } : current));
  }, []);

  const handleContextMenu = (event: ReactMouseEvent<HTMLElement>) => {
    // A menu of its own (the workspace row, the blank area) already took it.
    if (event.defaultPrevented) return;
    const row = registeredRow(registry, event.target, event.currentTarget);
    const items = row ? registry.get(row)?.current.menu : null;
    if (!row || !items) return;
    event.preventDefault();
    closeCard();
    // The menu key and Shift+F10 report no pointer position: open the menu under the row instead.
    const fromKeyboard = event.clientX === 0 && event.clientY === 0;
    const bounds = row.getBoundingClientRect();
    setMenu({
      open: true,
      anchor: fromKeyboard ? pointAnchor(bounds.left + 16, bounds.bottom) : pointAnchor(event.clientX, event.clientY),
      row,
      items,
    });
  };

  /** Shows the row's card after the usual delay, or at once while another row's card is open. */
  const showCardFor = (row: HTMLElement | null) => {
    window.clearTimeout(cardTimer.current);
    const rowCard = row ? registry.get(row)?.current.card : null;
    if (!row || !rowCard) {
      closeCard();
      return;
    }
    // Moving from one card's row to the next shows the next at once, like a tooltip group.
    if (cardOpen.current) {
      setCard({ open: true, anchor: row, card: rowCard });
      return;
    }
    cardTimer.current = window.setTimeout(() => {
      // The row re-rendered into a new element meanwhile: the next pointer move finds it again.
      if (!row.isConnected) {
        hoveredRow.current = null;
        return;
      }
      setCard({ open: true, anchor: row, card: rowCard });
    }, CARD_DELAY_MS);
  };

  const handlePointerOver = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.pointerType !== 'mouse' || event.buttons !== 0) return;
    const row = registeredRow(registry, event.target, event.currentTarget);
    if (row === hoveredRow.current) return;
    hoveredRow.current = row;
    showCardFor(row);
  };

  // Keyboard focus on a row shows its card too, as the per-row tooltips did; a click's focus does not.
  const handleFocus = (event: ReactFocusEvent<HTMLElement>) => {
    if (!isFocusVisible(event.target)) return;
    const row = registeredRow(registry, event.target, event.currentTarget);
    hoveredRow.current = row;
    showCardFor(row);
  };

  const handleBlur = (event: ReactFocusEvent<HTMLElement>) => {
    const next = event.relatedTarget;
    // Focus moving to another row is handled by its focus event.
    if (next instanceof Node && event.currentTarget.contains(next)) return;
    hoveredRow.current = null;
    closeCard();
  };

  const handlePointerOut = (event: ReactPointerEvent<HTMLElement>) => {
    const next = event.relatedTarget;
    if (next instanceof Node && event.currentTarget.contains(next)) return;
    hoveredRow.current = null;
    closeCard();
  };

  return (
    <RowOverlayRegistryContext.Provider value={registry}>
      <div
        className="contents"
        onContextMenu={handleContextMenu}
        onPointerOver={handlePointerOver}
        onPointerOut={handlePointerOut}
        onFocus={handleFocus}
        onBlur={handleBlur}
        // Pressing a row (to open it or drag it) puts its card away until the pointer leaves the row.
        onPointerDown={closeCard}
      >
        {children}
      </div>
      <Menu.Root open={menu.open} onOpenChange={(open) => setMenu((current) => ({ ...current, open }))}>
        {menu.items ? (
          <ContextMenuContent
            anchor={menu.anchor}
            // Escape returns to the row the menu was for; a click elsewhere keeps focus there.
            finalFocus={(closeType) => (closeType === 'keyboard' ? primaryControl(menu.row) : false)}
          >
            {menu.items()}
          </ContextMenuContent>
        ) : null}
      </Menu.Root>
      <TooltipRoot open={card.open} onOpenChange={(open) => { if (!open) closeCard(); }}>
        {card.card ? (
          <TooltipContent anchor={card.anchor} side="right" sideOffset={10} className={NOTE_CARD_CLASS} data-row-card="">
            {card.card()}
          </TooltipContent>
        ) : null}
      </TooltipRoot>
    </RowOverlayRegistryContext.Provider>
  );
}

function isFocusVisible(target: EventTarget) {
  if (!(target instanceof Element)) return false;
  try {
    return target.matches(':focus-visible');
  } catch {
    return true;
  }
}

function primaryControl(row: HTMLElement | null): HTMLElement | false {
  if (!row?.isConnected) return false;
  return row.querySelector<HTMLElement>('[data-folder-tree-primary="true"]')
    ?? row.querySelector<HTMLElement>('button:not([disabled])')
    ?? false;
}
