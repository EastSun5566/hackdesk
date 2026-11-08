import { afterEach, describe, expect, it } from 'vitest';

import { readSplitStatusLine, setSplitStatusLine, SPLIT_STATUS_LINE_KEY } from './split-status-line-preference';

describe('split status line preference', () => {
  afterEach(() => {
    window.localStorage.removeItem(SPLIT_STATUS_LINE_KEY);
  });

  it('is off by default', () => {
    expect(readSplitStatusLine()).toBe(false);
  });

  it('remembers the choice on this computer', () => {
    setSplitStatusLine(true);
    expect(readSplitStatusLine()).toBe(true);
    setSplitStatusLine(false);
    expect(readSplitStatusLine()).toBe(false);
  });
});
