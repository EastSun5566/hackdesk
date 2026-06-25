import {
  StateField,
  type Range,
  type EditorState,
  type Extension,
} from '@codemirror/state';
import {
  Decoration,
  EditorView,
  WidgetType,
  type DecorationSet,
} from '@codemirror/view';

import {
  parseMarkdownImage,
} from './hfm-recognizers';
import { treeGrowthEffect } from './tree-progress';

class ImagePreviewWidget extends WidgetType {
  constructor(
    private readonly src: string,
    private readonly alt: string,
    private readonly lineTo: number,
    private readonly width?: number,
    private readonly height?: number,
  ) {
    super();
  }

  eq(other: ImagePreviewWidget): boolean {
    return other.src === this.src
      && other.alt === this.alt
      && other.lineTo === this.lineTo
      && other.width === this.width
      && other.height === this.height;
  }

  toDOM(view: EditorView): HTMLElement {
    const wrap = document.createElement('figure');
    wrap.className = 'cm-hackmd-image-preview';
    wrap.setAttribute('contenteditable', 'false');

    const image = document.createElement('img');
    image.src = this.src;
    image.alt = this.alt;
    image.loading = 'lazy';

    if (this.width) {
      image.style.maxWidth = `${this.width}px`;
    }
    if (this.height) {
      image.style.maxHeight = `${this.height}px`;
    }

    wrap.appendChild(image);

    if (this.alt) {
      const caption = document.createElement('figcaption');
      caption.textContent = this.alt;
      wrap.appendChild(caption);
    }

    wrap.addEventListener('mousedown', (event) => {
      event.preventDefault();
      event.stopPropagation();

      view.focus();
      view.dispatch({
        selection: { anchor: this.lineTo },
        scrollIntoView: false,
      });
    });

    return wrap;
  }

  ignoreEvent(event: Event): boolean {
    return event.type === 'mousedown' || event.type === 'click';
  }
}

function buildHfmBlocks(state: EditorState): DecorationSet {
  const ranges: Array<Range<Decoration>> = [];

  for (let lineNumber = 1; lineNumber <= state.doc.lines; lineNumber += 1) {
    const line = state.doc.line(lineNumber);
    const image = parseMarkdownImage(line.text, line.to);
    if (image) {
      ranges.push(Decoration.widget({
        block: true,
        side: 1,
        widget: new ImagePreviewWidget(image.src, image.alt, image.lineTo, image.width, image.height),
      }).range(image.lineTo));
    }
  }

  return Decoration.set(ranges, true);
}

const hfmBlocksField = StateField.define<DecorationSet>({
  create: (state) => buildHfmBlocks(state),
  update(decorations, transaction) {
    for (const effect of transaction.effects) {
      if (effect.is(treeGrowthEffect)) {
        return buildHfmBlocks(transaction.state);
      }
    }

    if (!transaction.docChanged) {
      return decorations;
    }

    return buildHfmBlocks(transaction.state);
  },
  provide: (field) => EditorView.decorations.from(field),
});

export function hfmBlocks(): Extension {
  return hfmBlocksField;
}
