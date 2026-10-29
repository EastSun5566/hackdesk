export type MatchRange = [start: number, end: number];

const WORD_SEPARATOR = /[\s\-_/\\.:,;()[\]{}·|]/;

/**
 * The parts of `text` that a search query matched, for highlighting a result. The whole query wins,
 * then each of its words; a single word may also match letters that start words or follow one
 * another, as "nn" does in New Note. Looser fuzzy matches are left unmarked rather than scattered.
 */
export function findMatchRanges(text: string, query: string, { acronym = true } = {}): MatchRange[] {
  const lower = text.toLowerCase();
  const needle = query.trim().toLowerCase();
  // Lowercasing changed the length, so positions would point at the wrong characters.
  if (!needle || lower.length !== text.length) return [];

  const whole = lower.indexOf(needle);
  if (whole >= 0) return [[whole, whole + needle.length]];

  const words = needle.split(/\s+/);
  if (words.length > 1) {
    const ranges: MatchRange[] = [];
    for (const word of words) {
      const index = lower.indexOf(word);
      if (index < 0) return [];
      ranges.push([index, index + word.length]);
    }
    return mergeRanges(ranges);
  }

  return acronym ? acronymRanges(text, lower, needle) : [];
}

function acronymRanges(text: string, lower: string, needle: string): MatchRange[] {
  const ranges: MatchRange[] = [];
  let position = 0;
  for (const character of needle) {
    const last = ranges.at(-1);
    if (last && lower[last[1]] === character) {
      last[1] += 1;
    } else {
      let index = position;
      while (index < lower.length && !(lower[index] === character && isWordStart(text, index))) index += 1;
      if (index >= lower.length) return [];
      ranges.push([index, index + 1]);
    }
    position = ranges.at(-1)![1];
  }
  return ranges;
}

function isWordStart(text: string, index: number) {
  if (index === 0) return true;
  const previous = text[index - 1]!;
  const current = text[index]!;
  return WORD_SEPARATOR.test(previous)
    // camelCase: an upper-case letter after a lower-case one.
    || (current !== current.toLowerCase() && previous !== previous.toUpperCase());
}

function mergeRanges(ranges: MatchRange[]) {
  const merged: MatchRange[] = [];
  for (const [start, end] of [...ranges].sort((left, right) => left[0] - right[0])) {
    const last = merged.at(-1);
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  }
  return merged;
}
