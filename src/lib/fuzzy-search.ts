import Fuse from 'fuse.js';

type SearchText = string | null | undefined | Array<string | null | undefined>;

type FuzzySearchOptions<T> = {
  primary: (item: T) => SearchText;
  secondary?: (item: T) => SearchText;
};

type SearchRecord<T> = {
  index: number;
  item: T;
  primary: string[];
  secondary: string[];
};

const FUZZY_QUERY_MIN_LENGTH = 2;

function normalizeText(value: string) {
  return value.trim().toLowerCase();
}

function normalizeFields(value: SearchText): string[] {
  const values = Array.isArray(value) ? value : [value];
  return values
    .filter((field): field is string => typeof field === 'string' && field.length > 0)
    .map(normalizeText);
}

function getLiteralRank(record: SearchRecord<unknown>, query: string) {
  if (record.primary.some((field) => field === query)) {
    return 0;
  }
  if (record.primary.some((field) => field.startsWith(query))) {
    return 1;
  }
  if (record.primary.some((field) => field.includes(query)) || record.primary.join(' ').includes(query)) {
    return 2;
  }
  if (record.secondary.some((field) => field.includes(query)) || record.secondary.join(' ').includes(query)) {
    return 3;
  }

  return null;
}

function isAdjacentTransposition(left: string, right: string) {
  if (left.length !== right.length) {
    return false;
  }

  const mismatches: number[] = [];
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      mismatches.push(index);
      if (mismatches.length > 2) {
        return false;
      }
    }
  }

  const [first, second] = mismatches;
  return mismatches.length === 2
    && second === first + 1
    && left[first] === right[second]
    && left[second] === right[first];
}

function hasAdjacentTransposition(record: SearchRecord<unknown>, query: string) {
  return [...record.primary, ...record.secondary]
    .flatMap((field) => field.split(/[\s/_.:-]+/))
    .some((word) => isAdjacentTransposition(word, query));
}

export function fuzzySearch<T>(items: T[], query: string, options: FuzzySearchOptions<T>): T[] {
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) {
    return items;
  }

  const records: SearchRecord<T>[] = items.map((item, index) => ({
    index,
    item,
    primary: normalizeFields(options.primary(item)),
    secondary: normalizeFields(options.secondary?.(item)),
  }));
  const literalRanks = new Map(records.map((record) => [record, getLiteralRank(record, normalizedQuery)]));

  if (normalizedQuery.length < FUZZY_QUERY_MIN_LENGTH || normalizedQuery.includes(' ')) {
    return records
      .filter((record) => literalRanks.get(record) !== null)
      .sort((left, right) => (literalRanks.get(left) ?? 0) - (literalRanks.get(right) ?? 0))
      .map((record) => record.item);
  }

  const fuse = new Fuse(records, {
    includeScore: true,
    ignoreLocation: true,
    keys: [
      { name: 'primary', weight: 2 },
      { name: 'secondary', weight: 1 },
    ],
    minMatchCharLength: FUZZY_QUERY_MIN_LENGTH,
    threshold: 0.35,
  });
  const fuzzyScores = new Map(
    fuse.search(normalizedQuery).map((result) => [result.item, result.score ?? 1]),
  );
  for (const record of records) {
    if (!fuzzyScores.has(record) && hasAdjacentTransposition(record, normalizedQuery)) {
      fuzzyScores.set(record, 0.35);
    }
  }

  return records
    .filter((record) => literalRanks.get(record) !== null || fuzzyScores.has(record))
    .sort((left, right) => {
      const leftLiteralRank = literalRanks.get(left);
      const rightLiteralRank = literalRanks.get(right);
      if (leftLiteralRank != null && rightLiteralRank != null) {
        return leftLiteralRank - rightLiteralRank || left.index - right.index;
      }
      if (leftLiteralRank != null) {
        return -1;
      }
      if (rightLiteralRank != null) {
        return 1;
      }

      return (fuzzyScores.get(left) ?? 1) - (fuzzyScores.get(right) ?? 1)
        || left.index - right.index;
    })
    .map((record) => record.item);
}
