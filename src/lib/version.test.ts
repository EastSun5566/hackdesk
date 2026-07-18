import { describe, expect, it } from 'vitest';

import { isBetaVersion } from './version';

describe('isBetaVersion', () => {
  it.each([
    ['2.0.0-beta', true],
    ['2.0.0-beta.2', true],
    ['2.0.0-rc.1', false],
    ['2.0.0', false],
  ])('classifies %s', (version, expected) => {
    expect(isBetaVersion(version)).toBe(expected);
  });
});
