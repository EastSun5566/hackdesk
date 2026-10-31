import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { useWritingFade } from './useWritingFade';

function setup(enabled = true) {
  render(
    <>
      <input aria-label="Search notes" />
      <div className="cm-editor"><div role="textbox" tabIndex={0} aria-label="Note" /></div>
    </>,
  );
  const hook = renderHook(({ on }) => useWritingFade(on), { initialProps: { on: enabled } });
  const note = screen.getByRole('textbox', { name: 'Note' });
  act(() => note.focus());
  return { hook, note, writing: () => document.documentElement.dataset.writing === 'true' };
}

afterEach(() => { delete document.documentElement.dataset.writing; });

describe('useWritingFade', () => {
  it('marks the page while typing in a note, even across a pause and capital letters', () => {
    const { note, writing } = setup();
    expect(writing()).toBe(false);
    fireEvent.keyDown(note, { key: 'a' });
    expect(writing()).toBe(true);
    fireEvent.keyDown(note, { key: 'Shift', shiftKey: true });
    fireEvent.keyDown(note, { key: 'B', shiftKey: true });
    expect(writing()).toBe(true);
  });

  it.each([
    ['moving the pointer', () => fireEvent.pointerMove(document)],
    ['pressing Cmd', (note: HTMLElement) => fireEvent.keyDown(note, { key: 'Meta', metaKey: true })],
    ['a Ctrl chord', (note: HTMLElement) => fireEvent.keyDown(note, { key: 'k', ctrlKey: true })],
    ['leaving the editor', () => act(() => screen.getByRole('textbox', { name: 'Search notes' }).focus())],
    ['leaving the window', () => fireEvent.blur(window)],
  ])('brings the workbench back on %s', (_name, bringBack) => {
    const { note, writing } = setup();
    fireEvent.keyDown(note, { key: 'a' });
    bringBack(note);
    expect(writing()).toBe(false);
  });

  it('ignores typing outside a note', () => {
    const { writing } = setup();
    const search = screen.getByRole('textbox', { name: 'Search notes' });
    act(() => search.focus());
    fireEvent.keyDown(search, { key: 'a' });
    expect(writing()).toBe(false);
  });

  it('never fades when turned off, and clears the mark when turned off mid-sentence', () => {
    const { hook, note, writing } = setup();
    fireEvent.keyDown(note, { key: 'a' });
    hook.rerender({ on: false });
    expect(writing()).toBe(false);
    fireEvent.keyDown(note, { key: 'b' });
    expect(writing()).toBe(false);
  });
});
