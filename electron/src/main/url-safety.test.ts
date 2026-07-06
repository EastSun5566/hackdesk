import { describe, expect, it } from 'vitest';

import { classifyExternalUrl } from './url-safety';

describe('classifyExternalUrl', () => {
  it('allows http, https, and mailto URLs', () => {
    expect(classifyExternalUrl('https://hackmd.io')).toEqual({
      type: 'safe-external',
      url: 'https://hackmd.io/',
    });
    expect(classifyExternalUrl('mailto:support@example.com')).toEqual({
      type: 'safe-external',
      url: 'mailto:support@example.com',
    });
  });

  it('blocks dangerous or unsupported schemes with concrete reasons', () => {
    expect(classifyExternalUrl('javascript:alert(1)')).toMatchObject({
      type: 'blocked',
      reason: 'Blocked JavaScript URLs.',
    });
    expect(classifyExternalUrl('data:text/html,hi')).toMatchObject({
      type: 'blocked',
      reason: 'Blocked data URLs.',
    });
    expect(classifyExternalUrl('file:///tmp/secret')).toMatchObject({
      type: 'blocked',
      reason: 'Blocked local file URLs.',
    });
    expect(classifyExternalUrl('slack://open')).toMatchObject({
      type: 'blocked',
      reason: 'Blocked unsupported URL scheme: slack:',
    });
  });
});
