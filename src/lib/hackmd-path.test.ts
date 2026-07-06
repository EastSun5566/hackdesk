import { describe, expect, it } from 'vitest';

import { getHackmdNotePath, getHackmdPathFromPublishLink } from './hackmd-path';

describe('HackMD path helpers', () => {
  it('uses a verified HackMD publish link for team notes', () => {
    expect(getHackmdNotePath({
      publishType: 'view',
      shortId: 'short-id',
      userPath: null,
      teamPath: 'engineering',
      permalink: 'roadmap',
      publishLink: 'https://hackmd.io/@engineering/roadmap?both#intro',
    })).toBe('/@engineering/roadmap?both#intro');
  });

  it('forces edit mode from publish links without duplicating edit suffixes', () => {
    expect(getHackmdNotePath({
      publishType: 'view',
      shortId: 'short-id',
      userPath: null,
      teamPath: 'engineering',
      permalink: 'roadmap',
      publishLink: 'https://hackmd.io/@engineering/roadmap/edit',
    }, true)).toBe('/@engineering/roadmap/edit');
  });

  it('rejects non-HackMD publish links', () => {
    expect(getHackmdPathFromPublishLink('https://example.com/@engineering/roadmap')).toBeNull();
  });
});
