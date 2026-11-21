/**
 * Intra-line word diff for split/comment views. Bounded and allocation-light:
 * lines longer than MAX_LINE_LENGTH are returned as a single unchanged segment,
 * and the LCS table is capped so a pathological line cannot stall a request.
 */

export interface WordSegment {
  value: string;
  changed: boolean;
}

const MAX_LINE_LENGTH = 2_000;
const MAX_TOKENS = 400;

function tokenize(line: string): string[] {
  // Keep whitespace and word runs as separate tokens so highlighting is stable.
  return line.match(/\s+|[^\s]+/g) ?? [];
}

export function wordDiff(
  oldLine: string,
  newLine: string,
): { old: WordSegment[]; next: WordSegment[] } {
  if (oldLine.length > MAX_LINE_LENGTH || newLine.length > MAX_LINE_LENGTH) {
    return {
      old: [{ value: oldLine, changed: false }],
      next: [{ value: newLine, changed: false }],
    };
  }

  const a = tokenize(oldLine);
  const b = tokenize(newLine);

  if (a.length > MAX_TOKENS || b.length > MAX_TOKENS) {
    return {
      old: [{ value: oldLine, changed: false }],
      next: [{ value: newLine, changed: false }],
    };
  }

  const rows = a.length + 1;
  const cols = b.length + 1;
  const table: number[][] = Array.from({ length: rows }, () => new Array<number>(cols).fill(0));

  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      table[i]![j] =
        a[i] === b[j] ? table[i + 1]![j + 1]! + 1 : Math.max(table[i + 1]![j]!, table[i]![j + 1]!);
    }
  }

  const oldSegments: WordSegment[] = [];
  const newSegments: WordSegment[] = [];
  let i = 0;
  let j = 0;

  const push = (target: WordSegment[], value: string, changed: boolean) => {
    const last = target[target.length - 1];
    if (last && last.changed === changed) last.value += value;
    else target.push({ value, changed });
  };

  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      push(oldSegments, a[i]!, false);
      push(newSegments, b[j]!, false);
      i += 1;
      j += 1;
    } else if (table[i + 1]![j]! >= table[i]![j + 1]!) {
      push(oldSegments, a[i]!, true);
      i += 1;
    } else {
      push(newSegments, b[j]!, true);
      j += 1;
    }
  }

  while (i < a.length) {
    push(oldSegments, a[i]!, true);
    i += 1;
  }
  while (j < b.length) {
    push(newSegments, b[j]!, true);
    j += 1;
  }

  return { old: oldSegments, next: newSegments };
}
