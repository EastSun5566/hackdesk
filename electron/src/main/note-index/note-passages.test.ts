import { describe, expect, it } from 'vitest';

import { questionTerms } from './note-passages';
import { openNoteStore, type StoredNote } from './note-store';

function note(noteId: string, content: string, overrides: Partial<StoredNote> = {}): StoredNote {
  return { source: 'local', workspace: 'vault-1', noteId, title: noteId, content, revision: 'r1', meta: null, ...overrides };
}

const find = (store: ReturnType<typeof openNoteStore>, question: string, workspace = 'vault-1') => (
  store.findPassages({ question, source: 'local', workspace })
);

describe('questionTerms', () => {
  it('cuts Chinese into three-character pieces and keeps meaningful English words', () => {
    expect(questionTerms('離線閱讀的結論？')).toEqual(['離線閱', '線閱讀', '閱讀的', '讀的結', '的結論']);
    expect(questionTerms('What did we decide about the Offline cache in Q3?')).toEqual(['decide', 'offline', 'cache']);
    expect(questionTerms('會議 ok')).toEqual([]);
  });
});

describe('findPassages', () => {
  it('ranks the note that answers a Chinese question first', () => {
    const store = openNoteStore(':memory:');
    store.putNotes([
      note('meeting', '# 週會\n\n議程略過。\n\n結論：離線閱讀先只支援開過的筆記，全文搜尋下一版。', { title: '產品週會' }),
      note('recipe', '# 晚餐\n\n今天煮咖哩。'),
      note('mention', '之後再討論閱讀體驗。'),
    ]);
    const { passages, indexedCount } = find(store, '上次討論離線閱讀的結論是什麼？');
    expect(indexedCount).toBe(3);
    expect(passages[0]).toMatchObject({ noteId: 'meeting', title: '產品週會' });
    expect(passages[0]!.text).toContain('結論：離線閱讀先只支援開過的筆記');
    expect(passages.map(passage => passage.noteId)).not.toContain('recipe');
  });

  it('weighs titles above body text, and opens a note found by its title alone', () => {
    const store = openNoteStore(':memory:');
    store.putNotes([
      note('body', 'Some text that mentions the roadmap once.'),
      note('titled', 'First line of the plan.\n\nSecond paragraph.', { title: 'Roadmap' }),
    ]);
    const { passages } = find(store, 'roadmap');
    expect(passages.map(passage => passage.noteId)).toEqual(['titled', 'body']);
    expect(passages[0]!.text).toBe('First line of the plan.');
  });

  it('keeps the two most relevant paragraphs in reading order, without front matter, within limits', () => {
    const store = openNoteStore(':memory:');
    const filler = Array.from({ length: 30 }, (_, index) => `Filler paragraph ${index}.`).join('\n\n');
    store.putNotes([
      note('long', `---\ntitle: Long\n---\nCache design starts here.\n\n${filler}\n\nThe cache keeps opened notes offline.\n\n${'x'.repeat(5_000)} cache`),
      ...Array.from({ length: 12 }, (_, index) => note(`many-${index}`, `cache offline ${'y'.repeat(3_000)}`)),
    ]);
    const { passages } = find(store, 'offline cache');
    const long = passages.find(passage => passage.noteId === 'long')!;
    expect(long.text).toBe('Cache design starts here.\n\n…\n\nThe cache keeps opened notes offline.');
    expect(passages.length).toBeLessThanOrEqual(8);
    expect(passages.every(passage => passage.text.length <= 2_000)).toBe(true);
    expect(passages.reduce((total, passage) => total + passage.text.length, 0)).toBeLessThanOrEqual(16_000);
  });

  it('skips a note with no text and keeps the notes ranked below it', () => {
    const store = openNoteStore(':memory:');
    store.putNotes([
      note('empty', '---\ntags: roadmap\n---\n', { title: 'Roadmap' }),
      note('body', 'The roadmap starts with offline reading.'),
    ]);
    expect(find(store, 'roadmap').passages.map(passage => passage.noteId)).toEqual(['body']);
  });

  it('searches one workspace, and finds nothing without searchable words', () => {
    const store = openNoteStore(':memory:');
    store.putNotes([note('here', 'release checklist'), note('there', 'release checklist', { workspace: 'vault-2' })]);
    expect(find(store, 'release checklist').passages.map(passage => passage.noteId)).toEqual(['here']);
    expect(find(store, 'is it ok?')).toEqual({ passages: [], indexedCount: 1 });
  });
});
