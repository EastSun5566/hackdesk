export type LocalImageContext = {
  vaultId: string;
  noteId: string;
  relativePath: string;
};

export type LocalImageRequest = LocalImageContext & { src: string };

export const LOCAL_IMAGE_HOST = 'vault-image';

/** Local URLs are generated only for a saved local note, never taken from Markdown. */
export function resolvePreviewImageSource(src: string, context: LocalImageContext | null): string | null {
  if (/^https?:\/\//i.test(src)) return src;
  if (!context || /^[a-z][a-z\d+.-]*:/i.test(src) || /^[\\/]/.test(src)) return null;
  const url = new URL(`hackdesk://${LOCAL_IMAGE_HOST}/${encodeURIComponent(context.vaultId)}/${encodeURIComponent(context.noteId)}`);
  url.searchParams.set('notePath', context.relativePath);
  url.searchParams.set('src', src);
  return url.href;
}

export function parseLocalImageRequest(url: string): LocalImageRequest {
  const parsed = new URL(url);
  const segments = parsed.pathname.split('/');
  if (parsed.protocol !== 'hackdesk:' || parsed.host !== LOCAL_IMAGE_HOST || parsed.username || parsed.password
    || segments.length !== 3 || parsed.hash
    || [...parsed.searchParams.keys()].sort().join(',') !== 'notePath,src') {
    throw new Error('Invalid local image request.');
  }
  const vaultId = decodeURIComponent(segments[1]);
  const noteId = decodeURIComponent(segments[2]);
  const relativePath = parsed.searchParams.get('notePath')!;
  const src = parsed.searchParams.get('src')!;
  if ([vaultId, noteId, relativePath, src].some(value => !value || value.length > 4096 || value.includes('\0'))
    || /[\\/]/.test(vaultId + noteId)) {
    throw new Error('Invalid local image request.');
  }
  return { vaultId, noteId, relativePath, src };
}
