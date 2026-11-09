import { describe, expect, it, beforeEach } from 'vitest';

import {
  readRootSectionExpanded,
  ROOT_SECTION_COLLAPSED_PREFIX,
  writeRootSectionExpanded,
} from './workspace-root-section-preference';

describe('workspace root section preference', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('defaults to expanded and persists collapse per scope', () => {
    const key = `${ROOT_SECTION_COLLAPSED_PREFIX}personal`;
    expect(readRootSectionExpanded('personal')).toBe(true);
    writeRootSectionExpanded('personal', false);
    expect(window.localStorage.getItem(key)).toBe('true');
    expect(readRootSectionExpanded('personal')).toBe(false);
    writeRootSectionExpanded('team:acme', true);
    expect(readRootSectionExpanded('team:acme')).toBe(true);
  });
});
