import { createRoot, type Root } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { EditorView } from '@codemirror/view';
import { undo, redo } from '@codemirror/commands';
import { openSearchPanel } from '@codemirror/search';

import { HackmdMarkdownEditorCore } from '@/components/hackmd-live-preview/HackmdMarkdownEditorCore';
import { hfmFixtures } from '@/components/hackmd-live-preview/hfm-fixtures';
import type { EditorMode } from '@/lib/settings';

const host = document.getElementById('editor')!;
const frames = () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
let root: Root | undefined;
let view: EditorView;
let longTasks: number[] = [];
new PerformanceObserver((list) => longTasks.push(...list.getEntries().map((entry) => entry.duration)))
  .observe({ type: 'longtask' });

async function mount(doc: string, mode: EditorMode = 'standard') {
  const start = performance.now();
  root?.unmount();
  root = createRoot(host);
  flushSync(() => root!.render(<HackmdMarkdownEditorCore value={doc} onChange={() => {}} editorMode={mode} />));
  for (let attempt = 0; attempt < 200; attempt++) {
    const dom = host.querySelector<HTMLElement>('.cm-editor');
    if (dom && !dom.hasAttribute('data-editor-mode-loading')) {
      view = EditorView.findFromDOM(dom)!;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
    if (attempt === 199) throw new Error('Editor did not mount');
  }
  await frames();
  return performance.now() - start;
}

function documentFixture(lines: number) {
  return Array.from({ length: lines }, (_, index) => (
    index % 12 === 0 ? `## Section ${index}`
      : index % 12 === 1 ? '**bold** and *em* and [link](https://example.com)'
        : index % 12 === 2 ? `- [ ] task ${index}`
          : `Paragraph ${index} with \`inline code\` and enough text to wrap.`
  )).join('\n');
}

async function measure(lines: number) {
  longTasks = [];
  const openedMs = await mount(documentFixture(lines));
  await new Promise((resolve) => setTimeout(resolve, 300));
  const mountLongTasks = [...longTasks];
  view.focus();
  longTasks = [];
  const samples = { typing: [] as number[], cursor: [] as number[], scroll: [] as number[] };
  const dispatchMs = { typing: [] as number[], cursor: [] as number[] };
  for (let index = 0; index < 30; index++) {
    let start = performance.now();
    view.dispatch({ changes: { from: view.state.selection.main.head, insert: 'x' } });
    dispatchMs.typing.push(performance.now() - start);
    await frames();
    samples.typing.push(performance.now() - start);
    start = performance.now();
    view.dispatch({ selection: { anchor: Math.min(view.state.doc.length, view.state.selection.main.head + 5) } });
    dispatchMs.cursor.push(performance.now() - start);
    await frames();
    samples.cursor.push(performance.now() - start);
    start = performance.now();
    view.scrollDOM.scrollTop = index % 2 ? 0 : Math.min(500, view.scrollDOM.scrollHeight - view.scrollDOM.clientHeight);
    await frames();
    samples.scroll.push(performance.now() - start);
  }
  return { lines, openedMs, samples, dispatchMs, mountLongTasks, longTasks: [...longTasks] };
}

async function checkFeatures() {
  const results = [];
  for (const fixture of hfmFixtures) {
    await mount(fixture.markdown);
    view.dispatch({ selection: { anchor: fixture.markdown.length } });
    await frames();
    results.push({ name: fixture.name, sourceUnchanged: view.state.doc.toString() === fixture.markdown });
  }
  for (const mode of ['standard', 'vim', 'helix', 'emacs', 'kakoune'] as const) {
    const source = '# Header\n\nOriginal **bold** text';
    await mount(source, mode);
    view.focus();
    view.dispatch({ changes: { from: source.length, insert: ' inserted' } });
    const inserted = view.state.doc.toString();
    const undone = undo(view) && view.state.doc.toString() === source;
    const redone = redo(view) && view.state.doc.toString() === inserted;
    view.dispatch({ selection: { anchor: 2, head: 8 } });
    openSearchPanel(view);
    await frames();
    results.push({ mode, undo: undone, redo: redone, selection: view.state.selection.main.from === 2 && view.state.selection.main.to === 8, search: Boolean(host.querySelector('.cm-search')) });
  }
  // Scrolling without moving the cursor must decorate newly visible content.
  const source = ['Before', ...Array.from({ length: 1000 }, (_, index) => `Line ${index}`), '**bottom** and [link](https://example.com)'].join('\n');
  await mount(source);
  view.scrollDOM.scrollTop = view.scrollDOM.scrollHeight;
  await frames();
  await frames();
  const bottomText = () => [...host.querySelectorAll('.cm-line')].find((line) => line.textContent?.includes('bottom'))?.textContent;
  const hidden = bottomText() === 'bottom and link';
  view.dispatch({ selection: { anchor: source.indexOf('bottom') }, scrollIntoView: true });
  await frames();
  const revealed = bottomText() === '**bottom** and [link](https://example.com)';
  view.dispatch({ selection: { anchor: 0 } });
  await frames();
  results.push({ viewport: 'scroll/reveal/hide', hidden, revealed, hiddenAgain: bottomText() === 'bottom and link', sourceUnchanged: view.state.doc.toString() === source });
  view.contentDOM.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }));
  view.dispatch({ selection: { anchor: source.indexOf('bottom') } });
  view.scrollDOM.scrollTop = 0;
  await frames();
  view.scrollDOM.scrollTop = view.scrollDOM.scrollHeight;
  await frames();
  await frames();
  const frozenScroll = bottomText() === 'bottom and link';
  document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0 }));
  await new Promise((resolve) => setTimeout(resolve, 150));
  await frames();
  results.push({ viewport: 'pointer freeze/scroll/thaw', frozenScroll, thawed: bottomText() === '**bottom** and [link](https://example.com)' });
  return results;
}

// This API exists only in the isolated benchmark bundle.
Object.assign(window, { previewBenchmark: { mount, measure, checkFeatures, view: () => view, content: () => view.state.doc.toString() } });
