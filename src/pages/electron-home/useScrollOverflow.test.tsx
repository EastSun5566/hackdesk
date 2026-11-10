import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useScrollOverflow } from './useScrollOverflow';

function scroller({ content, view, offset = 0 }: { content: number; view: number; offset?: number }) {
  const element = document.createElement('div');
  Object.defineProperty(element, 'scrollHeight', { configurable: true, value: content });
  Object.defineProperty(element, 'clientHeight', { configurable: true, value: view });
  element.scrollTop = offset;
  return element;
}

describe('useScrollOverflow', () => {
  it('shows no edge when the content fits', () => {
    const { result } = renderHook(() => useScrollOverflow(scroller({ content: 200, view: 200 }), 'y'));
    expect(result.current).toEqual({ start: false, end: false });
  });

  it('shows only the far edge at the top, and only the near edge at the bottom', () => {
    const element = scroller({ content: 600, view: 200 });
    const { result } = renderHook(() => useScrollOverflow(element, 'y'));
    expect(result.current).toEqual({ start: false, end: true });

    act(() => {
      element.scrollTop = 200;
      element.dispatchEvent(new Event('scroll'));
    });
    expect(result.current).toEqual({ start: true, end: true });

    act(() => {
      element.scrollTop = 400;
      element.dispatchEvent(new Event('scroll'));
    });
    expect(result.current).toEqual({ start: true, end: false });
  });

  it('shows nothing without a scroller', () => {
    const { result } = renderHook(() => useScrollOverflow(null, 'y'));
    expect(result.current).toEqual({ start: false, end: false });
  });
});
