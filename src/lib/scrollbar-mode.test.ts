import { afterEach, describe, expect, it, vi } from 'vitest';

import { applyScrollbarMode, detectScrollbarMode } from './scrollbar-mode';

function mockScrollbarWidth(width: number) {
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(100);
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(100 - width);
}

describe('scrollbar mode', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete document.documentElement.dataset.scrollbars;
  });

  it('reads scrollbars that take no width as overlay', () => {
    mockScrollbarWidth(0);
    expect(detectScrollbarMode()).toBe('overlay');
  });

  it('reads scrollbars that take width as classic, and records the mode on the root', () => {
    mockScrollbarWidth(15);
    applyScrollbarMode();
    expect(document.documentElement.dataset.scrollbars).toBe('classic');
    expect(document.querySelector('[style*="overflow:scroll"]')).toBeNull();
  });
});
