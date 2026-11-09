import { afterEach, describe, expect, it } from 'vitest';

import { applyTreeGuides, readTreeGuides, setTreeGuides, TREE_GUIDES_KEY } from './tree-guides-preference';

describe('tree indent guides preference', () => {
  afterEach(() => {
    window.localStorage.removeItem(TREE_GUIDES_KEY);
    delete document.documentElement.dataset.treeGuides;
  });

  it('shows guides by default', () => {
    expect(readTreeGuides()).toBe(true);
    applyTreeGuides();
    expect(document.documentElement.dataset.treeGuides).toBe('shown');
  });

  it('hides guides through the root element and remembers the choice', () => {
    setTreeGuides(false);
    expect(document.documentElement.dataset.treeGuides).toBe('hidden');
    expect(readTreeGuides()).toBe(false);
    setTreeGuides(true);
    expect(document.documentElement.dataset.treeGuides).toBe('shown');
  });
});
