export type DiffPart = { type: 'equal' | 'delete' | 'insert'; text: string };

/** Above this many tokens per side the table grows too large; the change is shown whole. */
const MAX_TOKENS = 3_000;

// Whitespace runs, single CJK characters (no spaces between words), or runs of anything else.
const TOKEN_PATTERN = /\s+|[぀-ヿ㐀-鿿가-힯豈-﫿＀-￯]|[^\s぀-ヿ㐀-鿿가-힯豈-﫿＀-￯]+/g;

export function tokenize(text: string) {
  return text.match(TOKEN_PATTERN) ?? [];
}

function push(parts: DiffPart[], type: DiffPart['type'], text: string) {
  if (!text) return;
  const last = parts.at(-1);
  if (last?.type === type) last.text += text;
  else parts.push({ type, text });
}

/**
 * Folds a space that sits between two changes into them, so "are a excelent" → "is an excellent"
 * reads as one change instead of three, and each change shows its deletion before its insertion.
 */
function coalesce(parts: DiffPart[]) {
  const result: DiffPart[] = [];
  let deleted = '';
  let inserted = '';
  const flush = () => {
    push(result, 'delete', deleted);
    push(result, 'insert', inserted);
    deleted = '';
    inserted = '';
  };
  parts.forEach((part, index) => {
    const between = part.type === 'equal' && !part.text.trim()
      && index > 0 && index < parts.length - 1 && (deleted || inserted);
    if (part.type === 'delete' || between) deleted += part.text;
    if (part.type === 'insert' || between) inserted += part.text;
    if (part.type === 'equal' && !between) {
      flush();
      push(result, 'equal', part.text);
    }
  });
  flush();
  return result;
}

/** Word-level diff of `before` into `after`; joining equal + delete gives `before`, equal + insert gives `after`. */
export function diffWords(before: string, after: string): DiffPart[] {
  const a = tokenize(before);
  const b = tokenize(after);
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start += 1;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA -= 1;
    endB -= 1;
  }

  const parts: DiffPart[] = [];
  push(parts, 'equal', a.slice(0, start).join(''));
  const midA = a.slice(start, endA);
  const midB = b.slice(start, endB);
  if (midA.length > MAX_TOKENS || midB.length > MAX_TOKENS) {
    push(parts, 'delete', midA.join(''));
    push(parts, 'insert', midB.join(''));
  } else {
    // lengths[i][j]: longest common subsequence of midA[i..] and midB[j..].
    const width = midB.length + 1;
    const lengths = new Uint16Array((midA.length + 1) * width);
    for (let i = midA.length - 1; i >= 0; i -= 1) {
      for (let j = midB.length - 1; j >= 0; j -= 1) {
        lengths[i * width + j] = midA[i] === midB[j]
          ? lengths[(i + 1) * width + j + 1]! + 1
          : Math.max(lengths[(i + 1) * width + j]!, lengths[i * width + j + 1]!);
      }
    }
    let i = 0;
    let j = 0;
    while (i < midA.length && j < midB.length) {
      if (midA[i] === midB[j]) {
        push(parts, 'equal', midA[i]!);
        i += 1;
        j += 1;
      } else if (lengths[(i + 1) * width + j]! >= lengths[i * width + j + 1]!) {
        push(parts, 'delete', midA[i]!);
        i += 1;
      } else {
        push(parts, 'insert', midB[j]!);
        j += 1;
      }
    }
    push(parts, 'delete', midA.slice(i).join(''));
    push(parts, 'insert', midB.slice(j).join(''));
  }
  push(parts, 'equal', a.slice(endA).join(''));
  return coalesce(parts);
}
