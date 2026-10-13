// Pure, dependency-free matcher for auto-linking library terms in plain text.
// Matches are case-insensitive, whole-word, longest first, and skip text inside parentheses.

export type TermRow = { term: string; entryId: string; kind: string };
export type TextSegment = { text: string; match?: TermRow };

const WORD = /[\p{L}\p{N}_'’-]/u;
const isWordChar = (ch: string | undefined) => !!ch && WORD.test(ch);

export type TermIndex = Map<string, { lower: string; row: TermRow }[]>;

/** Build a first-character index; each bucket is sorted longest first. */
export function buildTermIndex(rows: readonly TermRow[]): TermIndex {
  const index: TermIndex = new Map();
  for (const row of rows) {
    const lower = row.term.trim().toLowerCase();
    if (!lower) continue;
    const bucket = index.get(lower[0]) ?? [];
    bucket.push({ lower, row });
    index.set(lower[0], bucket);
  }
  for (const bucket of index.values()) bucket.sort((a, b) => b.lower.length - a.lower.length);
  return index;
}

/** Split text into plain segments and matched-term segments. */
export function matchTerms(text: string, index: TermIndex): TextSegment[] {
  const out: TextSegment[] = [];
  const lower = text.toLowerCase();
  let depth = 0;
  let plainStart = 0;
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '(') { depth++; i++; continue; }
    if (ch === ')') { depth = Math.max(0, depth - 1); i++; continue; }
    if (depth === 0 && !isWordChar(text[i - 1])) {
      const bucket = index.get(lower[i]);
      const hit = bucket?.find(({ lower: t }) => lower.startsWith(t, i) && !isWordChar(text[i + t.length])
        && !t.includes('(') && !t.includes(')'));
      if (hit) {
        if (i > plainStart) out.push({ text: text.slice(plainStart, i) });
        out.push({ text: text.slice(i, i + hit.lower.length), match: hit.row });
        i += hit.lower.length;
        plainStart = i;
        continue;
      }
    }
    i++;
  }
  if (plainStart < text.length) out.push({ text: text.slice(plainStart) });
  return out;
}
