import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock ResizeObserver (required by cmdk)
class ResizeObserverMock {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
global.ResizeObserver = ResizeObserverMock;

Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
  writable: true,
  value: vi.fn(),
});

const createEmptyDomRect = (): DOMRect => {
  if (typeof DOMRect === 'function') {
    return new DOMRect(0, 0, 0, 0);
  }

  return {
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    toJSON: () => ({}),
  } as DOMRect;
};

const createEmptyDomRectList = (): DOMRectList =>
  ({
    length: 0,
    item: () => null,
    [Symbol.iterator]: function* () {
      yield* [];
    },
  }) as DOMRectList;

if (typeof Range !== 'undefined') {
  Object.defineProperty(Range.prototype, 'getBoundingClientRect', {
    configurable: true,
    value: createEmptyDomRect,
  });

  Object.defineProperty(Range.prototype, 'getClientRects', {
    configurable: true,
    value: createEmptyDomRectList,
  });
}

// Mock matchMedia (required by theme-provider)
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: query.includes('dark'),
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});
