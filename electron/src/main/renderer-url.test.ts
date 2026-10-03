import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import { resolve } from 'node:path';

const electronMock = vi.hoisted(() => ({ isPackaged: false }));
vi.mock('electron', () => ({ app: electronMock }));

import { getRendererEntryUrl, getRendererRouteUrl, getProductionRendererUrl, isTrustedRendererUrl, resolveRendererFile } from './renderer-url';

describe('renderer URL helpers', () => {
  beforeEach(() => { electronMock.isPackaged = false; });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('uses the custom production renderer protocol', () => {
    expect(getProductionRendererUrl()).toBe('hackdesk://renderer/index.html#/electron');
    expect(isTrustedRendererUrl('hackdesk://renderer/index.html#/electron')).toBe(true);
    expect(isTrustedRendererUrl('file:///tmp/index.html')).toBe(false);
  });

  it('trusts only the configured dev server origin in development', () => {
    vi.stubEnv('HACKDESK_ELECTRON_DEV_SERVER_URL', 'http://localhost:5173/');

    expect(isTrustedRendererUrl('http://localhost:5173/#/electron')).toBe(true);
    expect(isTrustedRendererUrl('http://localhost:5174/#/electron')).toBe(false);
    expect(isTrustedRendererUrl('hackdesk://renderer/index.html#/electron')).toBe(false);
  });

  it('ignores an environment override for loading and IPC trust in a packaged app', () => {
    electronMock.isPackaged = true;
    vi.stubEnv('HACKDESK_ELECTRON_DEV_SERVER_URL', 'https://attacker.example/');
    expect(getRendererEntryUrl()).toBe(getProductionRendererUrl());
    expect(getRendererRouteUrl('/quick-capture')).toBe('hackdesk://renderer/index.html#/quick-capture');
    expect(isTrustedRendererUrl('https://attacker.example/#/electron')).toBe(false);
    expect(isTrustedRendererUrl(getProductionRendererUrl())).toBe(true);
  });

  it('resolves renderer files without allowing path traversal', () => {
    expect(resolveRendererFile('hackdesk://renderer/index.html', '/app/dist')).toBe(resolve('/app/dist/index.html'));
    expect(() => resolveRendererFile('hackdesk://renderer/../../secret.txt', '/app/dist')).toThrow(
      'Blocked renderer path traversal.',
    );
    expect(() => resolveRendererFile('https://example.com/index.html', '/app/dist')).toThrow(
      'Blocked untrusted renderer URL.',
    );
  });
});
