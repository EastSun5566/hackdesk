import { StateField, type EditorState, type Extension, type Range } from '@codemirror/state';
import { Decoration, EditorView, WidgetType, type DecorationSet } from '@codemirror/view';

import { parseEmbedLine, type EmbedLine } from '@/lib/note-links';

import { isInCodeOrFrontMatter } from '../note-links/extension';

/** What a card shows once the embedded or previewed note is known. */
export type NoteEmbedCard = { title: string; snippet: string | null };

export type NoteEmbedHost = {
  /** Looks the target up in local data only; null when nothing here knows it. */
  describe: (embed: EmbedLine) => Promise<NoteEmbedCard | null>;
  open: (embed: EmbedLine) => void;
};

const embedTarget = (embed: EmbedLine) => (embed.kind === 'embed' ? embed.raw : embed.url);

/** A card under a `{%hackmd %}` or `{%preview %}` line, naming the note it shows. */
class NoteEmbedWidget extends WidgetType {
  constructor(private readonly embed: EmbedLine, private readonly host: NoteEmbedHost) {
    super();
  }

  eq(other: NoteEmbedWidget) {
    return other.embed.kind === this.embed.kind && embedTarget(other.embed) === embedTarget(this.embed);
  }

  toDOM() {
    const card = document.createElement('div');
    card.className = 'cm-note-embed';
    card.dataset.embedKind = this.embed.kind;
    const label = card.appendChild(document.createElement('span'));
    label.className = 'cm-note-embed-label';
    label.textContent = this.embed.kind === 'embed' ? 'Embedded note' : 'Link preview';
    const title = card.appendChild(document.createElement('span'));
    title.className = 'cm-note-embed-title';
    title.textContent = embedTarget(this.embed);
    const snippet = card.appendChild(document.createElement('span'));
    snippet.className = 'cm-note-embed-snippet';
    const open = card.appendChild(document.createElement('button'));
    open.type = 'button';
    open.className = 'cm-note-embed-open';
    open.textContent = 'Open';
    open.setAttribute('aria-label', `Open ${embedTarget(this.embed)}`);
    open.addEventListener('mousedown', event => event.preventDefault());
    open.addEventListener('click', (event) => {
      event.preventDefault();
      this.host.open(this.embed);
    });
    void this.host.describe(this.embed).then((found) => {
      if (!found) return;
      title.textContent = found.title || embedTarget(this.embed);
      open.setAttribute('aria-label', `Open ${found.title || embedTarget(this.embed)}`);
      snippet.textContent = found.snippet?.replace(/\s+/g, ' ').trim() ?? '';
    }).catch(() => undefined);
    return card;
  }

  ignoreEvent() {
    return true;
  }
}

function buildCards(state: EditorState, host: NoteEmbedHost): DecorationSet {
  const ranges: Range<Decoration>[] = [];
  for (let number = 1; number <= state.doc.lines; number += 1) {
    const line = state.doc.line(number);
    if (!line.text.includes('{%')) continue;
    const embed = parseEmbedLine(line.text);
    // HackMD shows these as plain text inside code.
    if (!embed || isInCodeOrFrontMatter(state, line.to)) continue;
    ranges.push(Decoration.widget({ block: true, side: 1, widget: new NoteEmbedWidget(embed, host) }).range(line.to));
  }
  return Decoration.set(ranges, true);
}

const theme = EditorView.baseTheme({
  '.cm-note-embed': {
    display: 'grid',
    gridTemplateColumns: '1fr auto',
    gap: '2px 12px',
    margin: '6px 0',
    padding: '8px 12px',
    border: '1px solid var(--border-default)',
    borderRadius: '6px',
    backgroundColor: 'var(--background-muted)',
    fontFamily: 'var(--font-sans)',
  },
  '.cm-note-embed-label': { gridColumn: '1', fontSize: '11px', color: 'var(--text-subtle)' },
  '.cm-note-embed-title': { gridColumn: '1', fontWeight: '600', color: 'var(--text-default)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  '.cm-note-embed-snippet': {
    gridColumn: '1', fontSize: '12px', color: 'var(--text-subtle)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  '.cm-note-embed-snippet:empty': { display: 'none' },
  '.cm-note-embed-open': {
    gridColumn: '2', gridRow: '1 / span 3', alignSelf: 'center',
    padding: '2px 10px', border: '1px solid var(--border-default)', borderRadius: '999px',
    backgroundColor: 'var(--background-default)', color: 'var(--text-default)', fontSize: '12px', cursor: 'pointer',
  },
  '.cm-note-embed-open:hover': { backgroundColor: 'var(--background-selected)' },
});

/** Shows HackMD note embeds and link previews as cards, keeping their source line editable. */
export function noteEmbeds(host: NoteEmbedHost): Extension {
  const field = StateField.define<DecorationSet>({
    create: state => buildCards(state, host),
    update: (cards, transaction) => (transaction.docChanged ? buildCards(transaction.state, host) : cards),
    provide: value => EditorView.decorations.from(value),
  });
  return [field, theme];
}
