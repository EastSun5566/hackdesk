import { currentCompletions, startCompletion } from '@codemirror/autocomplete';
import { afterEach, describe, expect, it } from 'vitest';

import { choose, labels, offersWhileTyping, setup } from './test-utils';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('front matter completions', () => {
  it('lists keys at the start of a front matter line, then the values of a key that has them', async () => {
    const view = setup('---\nty\n---', '---\nty'.length);
    expect(await labels(view)).toContain('type');
    await choose(view, 'type');
    expect(view.state.doc.toString()).toBe('---\ntype: \n---');
    expect(await labels(view)).toEqual(['slide']);
    await choose(view, 'slide');
    expect(view.state.doc.toString()).toBe('---\ntype: slide\n---');
  });

  it('nests slide options and lists the built-in themes and transitions', async () => {
    const view = setup('---\nslideO\n---', '---\nslideO'.length);
    await choose(view, 'slideOptions');
    expect(view.state.doc.toString()).toBe('---\nslideOptions:\n  \n---');
    expect(await labels(view)).toEqual(['theme', 'transition']);
    await choose(view, 'theme');
    expect(await labels(view)).toContain('solarized');
    await choose(view, 'solarized');
    expect(view.state.doc.toString()).toBe('---\nslideOptions:\n  theme: solarized\n---');

    const transition = setup('---\nslideOptions:\n  transition: fa\n---', '---\nslideOptions:\n  transition: fa'.length);
    await choose(transition, 'fade');
    expect(transition.state.doc.toString()).toBe('---\nslideOptions:\n  transition: fade\n---');
  });

  it('stays quiet outside front matter, under other keys, and until a letter is typed', async () => {
    expect(await offersWhileTyping('Intro\nty')).toBe(false);
    expect(await offersWhileTyping('---\ntitle: x\n  th|\n---')).toBe(false);
    expect(await offersWhileTyping('---\n|\n---')).toBe(false);
    expect(await offersWhileTyping('---\nti|\n---')).toBe(true);
  });
});

describe('tag completions', () => {
  it('offers workspace tags after tags: and each comma, leaving out tags already there', async () => {
    const view = setup('---\ntags: design, \n---', '---\ntags: design, '.length);
    expect(await labels(view)).toEqual(['planning', 'release']);
    await choose(view, 'release');
    expect(view.state.doc.toString()).toBe('---\ntags: design, release\n---');

    const typed = setup('---\ntags: pla\n---', '---\ntags: pla'.length);
    expect(await labels(typed)).toEqual(['planning']);
  });

  it('fills backticked tags on a ###### tags: line', async () => {
    const view = setup('###### tags: `design` re');
    expect(await labels(view)).toEqual(['release']);
    await choose(view, 'release');
    expect(view.state.doc.toString()).toBe('###### tags: `design` `release`');

    // closeBrackets typed the closing backtick.
    const quoted = setup('###### tags: `pl`', '###### tags: `pl'.length);
    await choose(quoted, 'planning');
    expect(quoted.state.doc.toString()).toBe('###### tags: `planning`');
  });

  it('opens no list without workspace tags, as in a Local Vault', async () => {
    const view = setup('---\ntags: \n---', '---\ntags: '.length, { tags: () => [] });
    startCompletion(view);
    await new Promise(resolve => setTimeout(resolve, 100));
    expect(currentCompletions(view.state)).toEqual([]);
  });
});
