import { acceptCompletion } from '@codemirror/autocomplete';
import { afterEach, describe, expect, it } from 'vitest';

import { formatMetadataTime } from './syntax';
import { choose, cursorLine, labels, offersWhileTyping, setup, typeOnThenChoose } from './test-utils';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('emoji completions', () => {
  it('lists emoji after a colon and two characters, and completes the shortcode', async () => {
    const view = setup('Great :smi');
    expect(await labels(view)).toContain(':smile:');
    await choose(view, ':smile:');
    expect(view.state.doc.toString()).toBe('Great :smile:');
  });

  it('stays quiet for times, web addresses, labels, one character, code and front matter', async () => {
    for (const doc of ['At 10:30', 'http://exam', '時間:10', 'note:ab', 'Hi :s', 'Use `:smi|`', '---\ntitle: x :smi|\n---', '```\n:smi']) {
      expect(await offersWhileTyping(doc), doc).toBe(false);
    }
    expect(await offersWhileTyping('(:smi')).toBe(true);
  });
});

describe('code block completions', () => {
  it('lists languages and diagrams, and closes a new block around an empty line', async () => {
    const view = setup('Intro\n\n```mer');
    const options = await labels(view);
    expect(options).toContain('mermaid');
    await choose(view, 'mermaid');
    expect(view.state.doc.toString()).toBe('Intro\n\n```mermaid\n\n```');
    expect(cursorLine(view)).toBe(4);

    const typescript = setup('```typ');
    await choose(typescript, 'typescript');
    expect(typescript.state.doc.toString()).toBe('```typescript\n\n```');
  });

  it('replaces fence characters closeBrackets typed after the cursor', async () => {
    const view = setup('```mer```', 6);
    await choose(view, 'mermaid');
    expect(view.state.doc.toString()).toBe('```mermaid\n\n```');
  });

  it('only changes the language of an existing block', async () => {
    const view = setup('```py\nprint(1)\n```', 5);
    await choose(view, 'python');
    expect(view.state.doc.toString()).toBe('```python\nprint(1)\n```');
  });

  it('stays quiet on a closing fence, and until a letter is typed', async () => {
    expect(await offersWhileTyping('```js\ncode\n```')).toBe(false);
    expect(await offersWhileTyping('Text\n\n```')).toBe(false);
    expect(await offersWhileTyping('Text\n\n```j')).toBe(true);
  });
});

describe('container completions', () => {
  it('lists container styles and closes a new container', async () => {
    const view = setup(':::wa');
    expect(await labels(view)).toEqual(['warning']);
    acceptCompletion(view);
    expect(view.state.doc.toString()).toBe(':::warning\n\n:::');
    expect(cursorLine(view)).toBe(2);
  });

  it('stays quiet on a closing ::: and inside code', async () => {
    expect(await offersWhileTyping(':::info\nText\n:::')).toBe(false);
    expect(await offersWhileTyping('```\n:::in')).toBe(false);
  });
});

describe('typing on while the list is open', () => {
  it('completes from where the typing ended, for every kind of suggestion', async () => {
    for (const [doc, more, label, result] of [
      [':::wa', 'rn', 'warning', ':::warning\n\n:::'],
      ['```mer', 'ma', 'mermaid', '```mermaid\n\n```'],
      ['{%yo', 'ut', 'youtube', '{%youtube  %}'],
      ['> [!wa', 'rn', 'Warning', '> [!WARNING]\n> '],
      ['[t', 'o', 'TOC', '[TOC]'],
      ['<!-- .sl', 'id', 'slide:', '<!-- .slide:  -->'],
      ['---\nty|\n---', 'p', 'type', '---\ntype: \n---'],
    ]) {
      const view = setup(doc!.replace('|', ''), doc!.includes('|') ? doc!.indexOf('|') : doc!.length);
      await typeOnThenChoose(view, more!, label!);
      expect(view.state.doc.toString(), doc).toBe(result);
    }
  });
});

describe('alert completions', () => {
  it('lists the five alert types in a blockquote and starts the alert text', async () => {
    const view = setup('> [!');
    expect((await labels(view)).sort()).toEqual(['Caution', 'Important', 'Note', 'Tip', 'Warning']);
    await choose(view, 'Tip');
    expect(view.state.doc.toString()).toBe('> [!TIP]\n> ');
    expect(cursorLine(view)).toBe(2);
  });

  it('takes the bracket closeBrackets added, and stays quiet outside a blockquote', async () => {
    const view = setup('> [!no]', 6);
    await choose(view, 'Note');
    expect(view.state.doc.toString()).toBe('> [!NOTE]\n> ');
    expect(await offersWhileTyping('Text [!no')).toBe(false);
    // Only `[!` right after `>` starts an alert.
    expect(await offersWhileTyping('> Ship it [!no')).toBe(false);
    expect(await offersWhileTyping('> - [!no')).toBe(false);
  });
});

describe('metadata completions', () => {
  it('offers [TOC] at the start of a line only', async () => {
    const view = setup('[to]', 3);
    expect(await labels(view)).toEqual(['TOC']);
    acceptCompletion(view);
    expect(view.state.doc.toString()).toBe('[TOC]');
    expect(await offersWhileTyping('See [to')).toBe(false);
  });

  it('offers name, time and color in a blockquote or list item, filling the signed-in name', async () => {
    const view = setup('> Ship it [na', undefined, { userName: () => 'Ada' });
    await choose(view, 'name=');
    expect(view.state.doc.toString()).toBe('> Ship it [name=Ada]');

    const nameless = setup('- [na');
    await choose(nameless, 'name=');
    expect(nameless.state.doc.toString()).toBe('- [name=]');
    expect(nameless.state.selection.main.head).toBe('- [name='.length);

    const time = setup('> [ti');
    await choose(time, 'time=');
    expect(time.state.doc.toString()).toMatch(/^> \[time=\w{3}, \w{3} \d{1,2}, \d{4} \d{1,2}:\d{2} [AP]M\]$/);

    const color = setup('* [co');
    await choose(color, 'color=');
    expect(color.state.doc.toString()).toMatch(/^\* \[color=#[0-9a-f]{6}\]$/);
  });

  it('writes times the way hackmd.io does', () => {
    expect(formatMetadataTime(new Date(2026, 9, 29, 19, 41))).toBe('Thu, Oct 29, 2026 7:41 PM');
    expect(formatMetadataTime(new Date(2026, 0, 4, 0, 5))).toBe('Sun, Jan 4, 2026 12:05 AM');
  });

  it('leaves links in ordinary text alone', async () => {
    expect(await offersWhileTyping('Read [na')).toBe(false);
    expect(await offersWhileTyping('[Plan')).toBe(false);
    expect(await offersWhileTyping('> [')).toBe(false);
  });
});

describe('slide attribute completions', () => {
  it('lists slide and element, then the attributes for each', async () => {
    const view = setup('<!-- .');
    expect((await labels(view)).sort()).toEqual(['element:', 'slide:']);
    await choose(view, 'element:');
    expect(view.state.doc.toString()).toBe('<!-- .element:  -->');
    expect(await labels(view)).toContain('class="fragment"');
    await choose(view, 'class="fragment"');
    expect(view.state.doc.toString()).toBe('<!-- .element: class="fragment" -->');
  });

  it('leaves the cursor inside an empty attribute value', async () => {
    const view = setup('<!-- .slide: data-bac -->', '<!-- .slide: data-bac'.length);
    await choose(view, 'data-background-color');
    expect(view.state.doc.toString()).toBe('<!-- .slide: data-background-color="" -->');
    expect(view.state.selection.main.head).toBe('<!-- .slide: data-background-color="'.length);
  });
});

describe('embed completions', () => {
  it('lists embeds after {% and completes one with its closing marks', async () => {
    const view = setup('{%you}', 5);
    expect(await labels(view)).toEqual(['youtube']);
    acceptCompletion(view);
    expect(view.state.doc.toString()).toBe('{%youtube  %}');
    expect(view.state.selection.main.head).toBe('{%youtube '.length);
  });

  it('offers the notes to embed right after choosing hackmd', async () => {
    const view = setup('{%hack');
    await choose(view, 'hackmd');
    expect(view.state.doc.toString()).toBe('{%hackmd  %}');
    expect(await labels(view)).toEqual(['Beta plan']);
  });

  it('lists embeds only at the start of a line', async () => {
    expect(await offersWhileTyping('{%')).toBe(true);
    expect(await offersWhileTyping('See {%you')).toBe(false);
  });
});
