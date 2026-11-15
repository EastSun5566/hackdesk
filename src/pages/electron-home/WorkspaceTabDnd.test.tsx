import type { Over } from '@dnd-kit/core';
import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { MAX_NOTE_PANES } from '@/lib/electron-actions';

import type { NotePane } from './note-workspace';
import type { NoteSummary } from '@/lib/electron-api';

import { computeWorkspaceDropTarget, tabStripDropId, useWorkspaceNoteDrop, useWorkspaceTabDnd, WorkspaceTabDndProvider, type WorkspaceNoteDrop } from './WorkspaceTabDnd';

function rect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
    x: left,
    y: top,
    toJSON: () => ({}),
  };
}

function createWorkspaceDom(panes: Array<{ paneId: string; rect: DOMRect }>, workspaceRect: DOMRect, tabRegionRect?: DOMRect) {
  const workspaceEl = document.createElement('div');
  workspaceEl.getBoundingClientRect = () => workspaceRect;
  for (const item of panes) {
    const section = document.createElement('section');
    section.dataset.documentPaneId = item.paneId;
    section.getBoundingClientRect = () => item.rect;
    workspaceEl.appendChild(section);
  }
  let tabRegionEl: HTMLElement | null = null;
  if (tabRegionRect) {
    tabRegionEl = document.createElement('div');
    tabRegionEl.dataset.documentPaneId = panes[0]?.paneId ?? 'pane-a';
    tabRegionEl.getBoundingClientRect = () => tabRegionRect;
  }
  return { workspaceEl, tabRegionEl };
}

describe('computeWorkspaceDropTarget', () => {
  const onePane: NotePane[] = [{ paneId: 'pane-a', tabIds: ['tab-1', 'tab-2'], activeTabId: 'tab-2' }];
  const twoPanes: NotePane[] = [
    { paneId: 'pane-a', tabIds: ['tab-1', 'tab-2'], activeTabId: 'tab-2' },
    { paneId: 'pane-b', tabIds: ['tab-3'], activeTabId: 'tab-3' },
  ];

  it('prefers top-bar tab and tab-strip targets over workspace drop zones', () => {
    const { workspaceEl, tabRegionEl } = createWorkspaceDom(
      [{ paneId: 'pane-a', rect: rect(200, 40, 800, 600) }],
      rect(200, 40, 800, 600),
      rect(200, 0, 800, 40),
    );
    const overTab = { id: 'tab-1', data: { current: { type: 'tab', paneId: 'pane-a', tabId: 'tab-1' } } } as unknown as Over;

    expect(computeWorkspaceDropTarget({
      drag: { tabId: 'tab-2', sourcePaneId: 'pane-a' },
      copy: false,
      point: { x: 990, y: 300 },
      over: overTab,
      workspaceEl,
      tabRegionEl,
      panes: onePane,
      zoomedPaneId: null,
    })).toEqual({ zone: null, stripId: tabStripDropId('pane-a') });

    expect(computeWorkspaceDropTarget({
      drag: { tabId: 'tab-2', sourcePaneId: 'pane-a' },
      copy: false,
      point: { x: 450, y: 20 },
      over: null,
      workspaceEl,
      tabRegionEl,
      panes: onePane,
      zoomedPaneId: null,
    })).toEqual({ zone: null, stripId: tabStripDropId('pane-a') });

    const leftSegment = document.createElement('div');
    leftSegment.dataset.documentPaneId = 'pane-a';
    leftSegment.getBoundingClientRect = () => rect(200, 0, 400, 40);
    const rightSegment = document.createElement('div');
    rightSegment.dataset.documentPaneId = 'pane-b';
    rightSegment.getBoundingClientRect = () => rect(600, 0, 400, 40);

    expect(computeWorkspaceDropTarget({
      drag: { tabId: 'tab-2', sourcePaneId: 'pane-a' },
      copy: false,
      point: { x: 750, y: 20 },
      over: null,
      workspaceEl,
      tabRegionEls: [leftSegment, rightSegment],
      panes: twoPanes,
      zoomedPaneId: null,
    })).toEqual({ zone: null, stripId: tabStripDropId('pane-b') });
  });

  it('detects pane edge splits and converts to workspace-local preview coordinates', () => {
    const { workspaceEl, tabRegionEl } = createWorkspaceDom(
      [{ paneId: 'pane-a', rect: rect(200, 40, 800, 600) }],
      rect(200, 40, 800, 600),
      rect(200, 0, 800, 40),
    );

    const rightHit = computeWorkspaceDropTarget({
      drag: { tabId: 'tab-2', sourcePaneId: 'pane-a' },
      copy: false,
      point: { x: 985, y: 340 },
      over: null,
      workspaceEl,
      tabRegionEl,
      panes: onePane,
      zoomedPaneId: null,
    });
    expect(rightHit).toEqual({
      zone: {
        kind: 'pane-edge',
        paneId: 'pane-a',
        direction: 'right',
        rect: { left: 400, top: 0, width: 400, height: 600 },
      },
      stripId: null,
    });

    const bottomHit = computeWorkspaceDropTarget({
      drag: { tabId: 'tab-2', sourcePaneId: 'pane-a' },
      copy: false,
      point: { x: 600, y: 620 },
      over: null,
      workspaceEl,
      tabRegionEl,
      panes: onePane,
      zoomedPaneId: null,
    });
    expect(bottomHit).toEqual({
      zone: {
        kind: 'pane-edge',
        paneId: 'pane-a',
        direction: 'down',
        rect: { left: 0, top: 300, width: 800, height: 300 },
      },
      stripId: null,
    });
  });

  it('detects outer workspace edge splits when multiple panes exist', () => {
    const { workspaceEl, tabRegionEl } = createWorkspaceDom(
      [
        { paneId: 'pane-a', rect: rect(200, 40, 400, 600) },
        { paneId: 'pane-b', rect: rect(608, 40, 392, 600) },
      ],
      rect(200, 40, 800, 600),
      rect(200, 0, 800, 40),
    );

    expect(computeWorkspaceDropTarget({
      drag: { tabId: 'tab-2', sourcePaneId: 'pane-a' },
      copy: false,
      point: { x: 600, y: 48 },
      over: null,
      workspaceEl,
      tabRegionEl,
      panes: twoPanes,
      zoomedPaneId: null,
    })).toEqual({
      zone: {
        kind: 'workspace-edge',
        direction: 'up',
        rect: { left: 0, top: 0, width: 800, height: 600 * 0.28 },
      },
      stripId: null,
    });
  });

  it('highlights another pane center for move, and source pane center only in copy mode', () => {
    const { workspaceEl, tabRegionEl } = createWorkspaceDom(
      [
        { paneId: 'pane-a', rect: rect(200, 40, 400, 600) },
        { paneId: 'pane-b', rect: rect(608, 40, 392, 600) },
      ],
      rect(200, 40, 800, 600),
      rect(200, 0, 800, 40),
    );

    expect(computeWorkspaceDropTarget({
      drag: { tabId: 'tab-2', sourcePaneId: 'pane-a' },
      copy: false,
      point: { x: 400, y: 340 },
      over: null,
      workspaceEl,
      tabRegionEl,
      panes: twoPanes,
      zoomedPaneId: null,
    })).toEqual({ zone: null, stripId: null });

    expect(computeWorkspaceDropTarget({
      drag: { tabId: 'tab-2', sourcePaneId: 'pane-a' },
      copy: true,
      point: { x: 400, y: 340 },
      over: null,
      workspaceEl,
      tabRegionEl,
      panes: twoPanes,
      zoomedPaneId: null,
    })).toEqual({
      zone: { kind: 'pane-center', paneId: 'pane-a', rect: { left: 0, top: 0, width: 400, height: 600 } },
      stripId: null,
    });

    expect(computeWorkspaceDropTarget({
      drag: { tabId: 'tab-2', sourcePaneId: 'pane-a' },
      copy: false,
      point: { x: 800, y: 340 },
      over: null,
      workspaceEl,
      tabRegionEl,
      panes: twoPanes,
      zoomedPaneId: null,
    })).toEqual({
      zone: { kind: 'pane-center', paneId: 'pane-b', rect: { left: 408, top: 0, width: 392, height: 600 } },
      stripId: null,
    });
  });

  it('disables splitting when panes are zoomed or at MAX_NOTE_PANES', () => {
    const { workspaceEl, tabRegionEl } = createWorkspaceDom(
      [
        { paneId: 'pane-a', rect: rect(200, 40, 400, 600) },
        { paneId: 'pane-b', rect: rect(608, 40, 392, 600) },
      ],
      rect(200, 40, 800, 600),
      rect(200, 0, 800, 40),
    );
    const maxPanes: NotePane[] = Array.from({ length: MAX_NOTE_PANES }, (_, index) => ({
      paneId: `pane-${index}`,
      tabIds: [`tab-${index}`],
      activeTabId: `tab-${index}`,
    }));

    // At MAX_NOTE_PANES, edge drop falls back to pane-center on another pane instead of splitting
    expect(computeWorkspaceDropTarget({
      drag: { tabId: 'tab-0', sourcePaneId: 'pane-0' },
      copy: false,
      point: { x: 985, y: 340 },
      over: null,
      workspaceEl,
      tabRegionEl,
      panes: maxPanes,
      zoomedPaneId: null,
    })).toEqual({
      zone: { kind: 'pane-center', paneId: 'pane-b', rect: { left: 408, top: 0, width: 392, height: 600 } },
      stripId: null,
    });

    // When zoomed, splitting on own pane edge is disabled
    expect(computeWorkspaceDropTarget({
      drag: { tabId: 'tab-2', sourcePaneId: 'pane-a' },
      copy: false,
      point: { x: 590, y: 340 },
      over: null,
      workspaceEl,
      tabRegionEl,
      panes: twoPanes,
      zoomedPaneId: 'pane-a',
    })).toEqual({ zone: null, stripId: null });
  });
});

function ProbeConsumer() {
  const dnd = useWorkspaceTabDnd();
  return <div data-testid="dnd-active">{String(dnd.inWorkspaceDnd)}</div>;
}

describe('WorkspaceTabDndProvider', () => {
  it('exposes inWorkspaceDnd context state to descendants', () => {
    render(
      <WorkspaceTabDndProvider
        panes={[{ paneId: 'pane-a', tabIds: ['tab-1'], activeTabId: 'tab-1' }]}
        activePaneId="pane-a"
        zoomedPaneId={null}
        getTabTitle={() => 'Alpha'}
        onReorderTab={vi.fn()}
      >
        <ProbeConsumer />
      </WorkspaceTabDndProvider>,
    );

    expect(screen.getByTestId('dnd-active')).toHaveTextContent('true');
  });
});

describe('dropping a note from outside the panes', () => {
  const note = { id: 'note-x', title: 'Dropped' } as NoteSummary;
  const panes: NotePane[] = [
    { paneId: 'pane-a', tabIds: ['tab-1', 'tab-2'], activeTabId: 'tab-2' },
    { paneId: 'pane-b', tabIds: ['tab-3'], activeTabId: 'tab-3' },
  ];

  function setup() {
    const onDropNote = vi.fn();
    let api: WorkspaceNoteDrop | null = null;
    let dnd: ReturnType<typeof useWorkspaceTabDnd> | null = null;
    function Probe() {
      api = useWorkspaceNoteDrop();
      dnd = useWorkspaceTabDnd();
      return null;
    }
    render(
      <WorkspaceTabDndProvider panes={panes} activePaneId="pane-a" zoomedPaneId={null} getTabTitle={() => ''} onReorderTab={vi.fn()} onDropNote={onDropNote}>
        <Probe />
      </WorkspaceTabDndProvider>,
    );
    // pane-a | pane-b, each with its tab bar above its card.
    const { workspaceEl } = createWorkspaceDom(
      [
        { paneId: 'pane-a', rect: rect(200, 40, 400, 600) },
        { paneId: 'pane-b', rect: rect(608, 40, 392, 600) },
      ],
      rect(200, 0, 800, 640),
    );
    const bar = document.createElement('div');
    bar.dataset.documentPaneId = 'pane-a';
    bar.getBoundingClientRect = () => rect(200, 0, 400, 40);
    const tab = document.createElement('li');
    tab.dataset.tabId = 'tab-1';
    tab.getBoundingClientRect = () => rect(204, 4, 120, 32);
    bar.appendChild(tab);
    act(() => {
      dnd!.registerWorkspaceElement(workspaceEl);
      dnd!.registerTabRegionElement('pane-a', bar);
    });
    return { onDropNote, api: () => api!, dnd: () => dnd! };
  }

  it('opens the note before the tab it lands on, or in the pane or split under the pointer', () => {
    const { onDropNote, api } = setup();

    expect(api().drop({ x: 250, y: 20 }, note)).toBe(true);
    expect(onDropNote).toHaveBeenLastCalledWith(note, { kind: 'pane', paneId: 'pane-a', overTabId: 'tab-1' });
    expect(api().drop({ x: 500, y: 20 }, note)).toBe(true);
    expect(onDropNote).toHaveBeenLastCalledWith(note, { kind: 'pane', paneId: 'pane-a', overTabId: undefined });
    // A note from outside may land in the middle of any pane, even the active one.
    expect(api().drop({ x: 400, y: 340 }, note)).toBe(true);
    expect(onDropNote).toHaveBeenLastCalledWith(note, { kind: 'pane', paneId: 'pane-a' });
    expect(api().drop({ x: 800, y: 600 }, note)).toBe(true);
    expect(onDropNote).toHaveBeenLastCalledWith(note, { kind: 'split', paneId: 'pane-b', direction: 'down' });
    expect(api().drop({ x: 205, y: 340 }, note)).toBe(true);
    expect(onDropNote).toHaveBeenLastCalledWith(note, { kind: 'split', edge: true, direction: 'left' });
  });

  it('leaves a drop outside the panes to the sidebar, and previews without dropping', () => {
    const { onDropNote, api, dnd } = setup();

    expect(api().drop({ x: 100, y: 340 }, note)).toBe(false);
    expect(onDropNote).not.toHaveBeenCalled();

    act(() => api().preview({ x: 400, y: 340 }));
    expect(dnd().dropOverlay).toMatchObject({ kind: 'pane-center', paneId: 'pane-a' });
    act(() => api().preview(null));
    expect(dnd().dropOverlay).toBeNull();
    expect(onDropNote).not.toHaveBeenCalled();
  });
});
