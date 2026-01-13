import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock Tauri APIs
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(global as any).__TAURI__ = {
  invoke: vi.fn(),
  event: {
    listen: vi.fn(),
    emit: vi.fn(),
  },
};

// Mock for @tauri-apps/api/core
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

// Mock for @tauri-apps/api/webviewWindow
vi.mock('@tauri-apps/api/webviewWindow', () => ({
  getCurrentWebviewWindow: vi.fn(() => ({
    close: vi.fn(),
    hide: vi.fn(),
    show: vi.fn(),
  })),
  WebviewWindow: vi.fn(),
}));
