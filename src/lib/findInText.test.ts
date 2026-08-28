import { describe, expect, it } from 'vitest';
import { findMatches, fold, segment } from './findInText';

describe('folding for search', () => {
  it('drops nikud and gershayim so a plain query still matches', () => {
    expect(fold('עה״ת').text).toBe('עהת');
    expect(fold('שָׁלוֹם').text).toBe('שלום');
  });

  it('remembers where each surviving character came from', () => {
    const { text, map } = fold('עה״ת');
    expect(text).toBe('עהת');
    // The ת is at index 3 in the original, after the gershayim.
    expect(map[2]).toBe(3);
  });
});

describe('finding text in a book', () => {
  const blocks = ['ענין מהות האש והתחזקות', 'עה״ת בלשון אחרת', 'ואין כאן דבר'];

  it('matches across gershayim however the reader types it', () => {
    expect(findMatches(blocks, 'עהת')).toHaveLength(1);
    expect(findMatches(blocks, 'עה״ת')).toHaveLength(1);
  });

  it('returns ranges into the original text, not the folded one', () => {
    const [hit] = findMatches(blocks, 'עהת');
    expect(hit.block).toBe(1);
    // Four characters in the source: ע ה ״ ת
    expect(blocks[1].slice(hit.start, hit.end)).toBe('עה״ת');
  });

  it('finds every occurrence', () => {
    expect(findMatches(['אש ואש ואש'], 'אש')).toHaveLength(3);
  });

  it('ignores a query too short to be useful', () => {
    expect(findMatches(blocks, 'א')).toHaveLength(0);
    expect(findMatches(blocks, ' ')).toHaveLength(0);
  });

  it('reports nothing when the text is absent', () => {
    expect(findMatches(blocks, 'זזזזז')).toHaveLength(0);
  });
});

describe('segmenting for highlight', () => {
  it('splits a string around its matches', () => {
    expect(segment('אבג דהו אבג', [{ start: 0, end: 3 }])).toEqual([
      { text: 'אבג', hit: true },
      { text: ' דהו אבג', hit: false },
    ]);
  });

  it('returns the whole string when nothing matched', () => {
    expect(segment('שלום', [])).toEqual([{ text: 'שלום', hit: false }]);
  });

  it('handles several matches in order', () => {
    const out = segment('אש ואש', [
      { start: 0, end: 2 },
      { start: 4, end: 6 },
    ]);
    expect(out.filter((s) => s.hit).map((s) => s.text)).toEqual(['אש', 'אש']);
  });
});
