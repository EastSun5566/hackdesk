import { afterEach, describe, expect, it } from 'vitest';

import { NEW_TAB_OPENS_KEY, readNewTabOpens, setNewTabOpens } from './new-tab-preference';

describe('new tab opens preference', () => {
  afterEach(() => {
    window.localStorage.removeItem(NEW_TAB_OPENS_KEY);
  });

  it('defaults to an empty page', () => {
    expect(readNewTabOpens()).toBe('empty');
  });

  it('remembers duplicate current note', () => {
    setNewTabOpens('duplicate');
    expect(readNewTabOpens()).toBe('duplicate');
    setNewTabOpens('empty');
    expect(readNewTabOpens()).toBe('empty');
  });
});
