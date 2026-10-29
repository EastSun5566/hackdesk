import { autocompletion } from '@codemirror/autocomplete';
import type { Extension } from '@codemirror/state';

import { noteLinkSources, pastedUrlTracking, type NoteLinksHost } from './note-links';
import { syntaxSources } from './syntax';

export type { NoteLinksHost } from './note-links';

/** Every suggestion the editor offers for HackMD syntax, from one autocompletion so their settings agree. */
export function hackmdCompletions(host: NoteLinksHost): Extension {
  return [
    pastedUrlTracking,
    autocompletion({
      override: [...noteLinkSources(host), ...syntaxSources],
      icons: false,
    }),
  ];
}
