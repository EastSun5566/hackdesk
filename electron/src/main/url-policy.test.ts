import { beforeEach, describe, expect, it, vi } from 'vitest';

const openExternal = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock('electron', () => ({ shell: { openExternal } }));

import { openExternalUrl, openHackmdEditor } from './url-policy';

describe('external URL dispatch', () => {
  beforeEach(() => openExternal.mockClear());

  it('normalizes allowed URLs and never hands a blocked URL to the OS', async () => {
    await openExternalUrl('https://hackmd.io');
    expect(openExternal).toHaveBeenCalledExactlyOnceWith('https://hackmd.io/');
    openExternal.mockClear();

    await expect(openExternalUrl('file:///tmp/private.md')).rejects.toThrow('Blocked local file URLs.');
    expect(openExternal).not.toHaveBeenCalled();
  });

  it('opens the HackMD edit URL even when a team publish link has another origin', async () => {
    await openHackmdEditor({
      publishType: 'view', shortId: 'note-1', userPath: null, teamPath: 'example',
      permalink: 'guide', publishLink: 'https://example.com/guide',
    });
    expect(openExternal).toHaveBeenCalledExactlyOnceWith('https://hackmd.io/@example/guide/edit');
  });
});
