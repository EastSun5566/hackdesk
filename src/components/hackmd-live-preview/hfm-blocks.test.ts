import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { EditorState } from '@codemirror/state';
import { EditorView, type DecorationSet } from '@codemirror/view';
import { describe, expect, it } from 'vitest';

import { applyImageSize, hfmBlocks } from './hfm-blocks';

/** The lines whose image figures the field draws, with the cursor at the end of the note. */
function figureLines(doc: string) {
  const state = EditorState.create({
    doc,
    selection: { anchor: doc.length },
    extensions: [markdown({ base: markdownLanguage }), hfmBlocks()],
  });
  const lines: number[] = [];
  for (const source of state.facet(EditorView.decorations)) {
    if (typeof source === 'function') continue;
    (source as DecorationSet).between(0, state.doc.length, (from) => {
      lines.push(state.doc.lineAt(from).number);
    });
  }
  return lines;
}

describe('image figures', () => {
  it('draws a figure for an image line but never inside code or front matter', () => {
    const doc = [
      '---',
      'cover: ![meta](m.png)',
      '---',
      '![real](a.png)',
      '',
      '```md',
      '![example](b.png)',
      '```',
      '',
      '    ![indented](c.png)',
      '',
      'end',
    ].join('\n');

    // Only line 4: the fenced, indented and front-matter lines stay source, as HackMD shows code.
    expect(figureLines(doc)).toEqual([4]);
  });
});

describe('applyImageSize', () => {
  it('renders a given width as the image width, scaling small images up', () => {
    const image = document.createElement('img');
    applyImageSize(image, { value: 200, unit: 'px' }, undefined, { width: 40, height: 20 });
    expect(image.style.width).toBe('200px');
    expect(image.style.height).toBe('');
    expect(image.getAttribute('width')).toBe('200');
    expect(image.getAttribute('height')).toBeNull();
  });

  it('supports percentage widths and pixel heights, and ignores percentage heights', () => {
    const percent = document.createElement('img');
    applyImageSize(percent, { value: 50, unit: '%' }, { value: 20, unit: '%' }, undefined);
    expect(percent.style.width).toBe('50%');
    expect(percent.style.height).toBe('');

    const tall = document.createElement('img');
    applyImageSize(tall, undefined, { value: 90, unit: 'px' }, undefined);
    expect(tall.style.height).toBe('90px');
  });

  it('reserves the cached natural size for unsized images', () => {
    const image = document.createElement('img');
    applyImageSize(image, undefined, undefined, { width: 640, height: 360 });
    expect([image.width, image.height]).toEqual([640, 360]);
  });
});
