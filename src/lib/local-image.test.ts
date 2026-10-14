import { describe, expect, it } from 'vitest';
import { parseLocalImageRequest, resolvePreviewImageSource } from './local-image';

const context = { vaultId: 'vault-a', noteId: 'note-a', relativePath: 'notes/Note.md' };

describe('local image URLs', () => {
  it('preserves the note identity and Markdown URL encoding separately', () => {
    const src = '../images/圖%20%23%25.png?size=1#preview';
    const url = resolvePreviewImageSource(src, context)!;
    expect(new URL(url).host).toBe('vault-image');
    expect(parseLocalImageRequest(url)).toEqual({ ...context, src });
    expect(resolvePreviewImageSource(src, { ...context, relativePath: 'moved/Note.md' })).not.toBe(url);
    expect(resolvePreviewImageSource(src, { ...context, vaultId: 'vault-b' })).not.toBe(url);
  });

  it('keeps web images unchanged and does not guess a new draft location', () => {
    expect(resolvePreviewImageSource('https://example.com/image.png', context)).toBe('https://example.com/image.png');
    expect(resolvePreviewImageSource('image.png', null)).toBeNull();
  });

  it.each(['file:///tmp/image.png', 'hackdesk://vault-image/a/b', 'javascript:alert(1)', '//server/image.png', '/image.png', '\\image.png'])('does not turn %s into a local image', src => {
    expect(resolvePreviewImageSource(src, context)).toBeNull();
  });

  it.each([
    'hackdesk://renderer/a/b?notePath=n.md&src=a.png',
    'hackdesk://user@vault-image/a/b?notePath=n.md&src=a.png',
    'hackdesk://vault-image/a/b/c?notePath=n.md&src=a.png',
    'hackdesk://vault-image/a/b?notePath=n.md&src=a.png&src=b.png',
    'hackdesk://vault-image/a/b?notePath=n.md&src=a.png&extra=x',
    'hackdesk://vault-image/a/%ZZ?notePath=n.md&src=a.png',
    'hackdesk://vault-image/a/b?notePath=&src=a.png',
  ])('rejects a malformed protocol request: %s', url => {
    expect(() => parseLocalImageRequest(url)).toThrow();
  });
});
