// Hebrew points/accents, and the geresh/gershayim variants a reader is unlikely
// to type. Folding these is what lets "עהת" find עה״ת.
const NIKUD = /[֑-ׇ]/;
const MARKS = /[׳״"'`‘’“”]/;

export interface Folded {
  /** The searchable form. */
  text: string;
  /** For each character in `text`, its index in the original string. */
  map: number[];
}

/**
 * Fold a string for searching while remembering where each surviving character
 * came from, so a match can be highlighted in the original text.
 */
export function fold(source: string): Folded {
  let text = '';
  const map: number[] = [];
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (NIKUD.test(ch) || MARKS.test(ch)) continue;
    text += ch.toLowerCase();
    map.push(i);
  }
  return { text, map };
}

export interface Match {
  /** Index of the block this match falls in. */
  block: number;
  start: number;
  end: number;
}

/**
 * Every occurrence of `query` across the blocks' plain text, as ranges into the
 * original (unfolded) strings.
 */
export function findMatches(blocks: string[], query: string): Match[] {
  const needle = fold(query).text.trim();
  if (needle.length < 2) return [];

  const matches: Match[] = [];
  blocks.forEach((source, block) => {
    const { text, map } = fold(source);
    let from = 0;
    for (;;) {
      const at = text.indexOf(needle, from);
      if (at === -1) break;
      // map[] is per surviving character, so the end is the character after
      // the last one matched.
      const start = map[at];
      const last = map[at + needle.length - 1];
      if (start !== undefined && last !== undefined) {
        matches.push({ block, start, end: last + 1 });
      }
      from = at + needle.length;
    }
  });
  return matches;
}

export interface Segment {
  text: string;
  hit: boolean;
}

/** Split one block's text into plain and highlighted segments. */
export function segment(source: string, ranges: { start: number; end: number }[]): Segment[] {
  if (ranges.length === 0) return [{ text: source, hit: false }];

  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  const out: Segment[] = [];
  let at = 0;
  for (const r of sorted) {
    if (r.start < at) continue; // overlapping match, already covered
    if (r.start > at) out.push({ text: source.slice(at, r.start), hit: false });
    out.push({ text: source.slice(r.start, r.end), hit: true });
    at = r.end;
  }
  if (at < source.length) out.push({ text: source.slice(at), hit: false });
  return out;
}
