import { EditorView } from '@codemirror/view';

/**
 * closeBrackets pairs `*` and `_` so `*word*` is quick to type. But an emphasis mark followed by a
 * space opens nothing (`* ` starts a list item, `2 * 3` is arithmetic), so typing a space right after
 * an opener whose closer sits after the cursor drops that closer instead of leaving `* *` behind.
 */
export const emphasisPairSpace = EditorView.inputHandler.of((view, from, to, text) => {
  if (text !== ' ' || from !== to || view.state.selection.ranges.length !== 1) return false;
  const { doc } = view.state;
  const line = doc.lineAt(from);
  const before = doc.sliceString(line.from, from);
  const after = doc.sliceString(from, line.to);
  const mark = before.at(-1);
  if ((mark !== '*' && mark !== '_') || !after.startsWith(mark)) return false;
  // Only a closer at a word boundary is one closeBrackets typed: `*|*` or `*|* more`, not `*|**`.
  if (after.length > 1 && !/\s/.test(after[1]!)) return false;
  // `**|**` is a bold pair being typed; its inner space belongs to the user.
  if (before.at(-2) === mark) return false;
  view.dispatch({
    changes: { from, to: from + 1, insert: ' ' },
    selection: { anchor: from + 1 },
    userEvent: 'input.type',
  });
  return true;
});
