import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolvePreviewImageSource } from '../../../src/lib/local-image';

const mocks = vi.hoisted(() => ({
  handle: vi.fn(),
  fetch: vi.fn(),
  readImage: vi.fn(),
}));
vi.mock('electron', () => ({
  app: { isPackaged: true },
  protocol: { registerSchemesAsPrivileged: vi.fn(), handle: mocks.handle },
  net: { fetch: mocks.fetch },
}));
vi.mock('./local-vault-service', () => ({ readLocalVaultImage: mocks.readImage }));
import { registerRendererProtocol } from './renderer-protocol';
import { isTrustedRendererUrl } from './renderer-url';

registerRendererProtocol();
const handler = mocks.handle.mock.calls[0][1] as (request: Request) => Promise<Response>;
const url = resolvePreviewImageSource('image.svg', { vaultId: 'vault', noteId: 'note', relativePath: 'Note.md' })!;

describe('renderer and local image protocol', () => {
  beforeEach(() => {
    mocks.readImage.mockReset();
    mocks.fetch.mockReset();
  });

  it('serves image-only responses without granting renderer trust', async () => {
    mocks.readImage.mockResolvedValue({ bytes: new TextEncoder().encode('<svg/>'), mimeType: 'image/svg+xml' });
    const response = await handler(new Request(url, { headers: { 'sec-fetch-dest': 'image' } }));
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/svg+xml');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('content-security-policy')).toContain("default-src 'none'");
    expect(response.headers.get('content-security-policy')).toContain('sandbox');
    expect(isTrustedRendererUrl(url)).toBe(false);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it.each(['document', 'iframe', 'script'])('rejects %s requests before reading a file', async destination => {
    const response = await handler(new Request(url, { headers: { 'sec-fetch-dest': destination } }));
    expect(response.status).toBe(404);
    expect(mocks.readImage).not.toHaveBeenCalled();
  });

  it('rejects malformed URLs and non-GET requests', async () => {
    for (const request of [new Request('hackdesk://vault-image/a/b'), new Request(url, { method: 'POST' })]) {
      expect((await handler(request)).status).toBe(404);
    }
    expect(mocks.readImage).not.toHaveBeenCalled();
  });

  it('returns a generic error without leaking the file path', async () => {
    mocks.readImage.mockRejectedValue(new Error('/private/user/file.png is missing'));
    const response = await handler(new Request(url));
    expect(response.status).toBe(404);
    expect(await response.text()).toBe('Image unavailable.');
  });

  it('allows only the image host in the renderer image CSP', async () => {
    mocks.fetch.mockResolvedValue(new Response('<html/>'));
    const response = await handler(new Request('hackdesk://renderer/index.html'));
    const csp = response.headers.get('content-security-policy')!;
    expect(csp).toContain('https: hackdesk://vault-image');
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("connect-src 'self' https://api.hackmd.io");
    expect(csp).not.toContain('file:');
    expect((await handler(new Request('hackdesk://other/index.html'))).status).toBe(400);
  });
});
