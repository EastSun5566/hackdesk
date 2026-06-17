import type { NoteSummary } from './electron-api';
import { getHackmdNotePath } from './hackmd-path';

const HACKMD_ORIGIN = 'https://hackmd.io';

export function getHackmdNoteUrl(note: Pick<
  NoteSummary,
  'publishType' | 'shortId' | 'userPath' | 'teamPath' | 'permalink' | 'publishLink'
>) {
  return `${HACKMD_ORIGIN}${getHackmdNotePath(note)}`;
}

export function escapeMarkdownLinkText(text: string) {
  return text.replace(/\\/g, '\\\\').replace(/\[/g, '\\[').replace(/\]/g, '\\]');
}

export function getMarkdownNoteLink(note: Pick<
  NoteSummary,
  'title' | 'publishType' | 'shortId' | 'userPath' | 'teamPath' | 'permalink' | 'publishLink'
>) {
  const title = note.title.trim() || 'Untitled';
  return `[${escapeMarkdownLinkText(title)}](${getHackmdNoteUrl(note)})`;
}
