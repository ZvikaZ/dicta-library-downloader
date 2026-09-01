import { describe, expect, it } from 'vitest';
import { buildOpdsFiles, categorySlug, normaliseBaseUrl } from './opds';

const REAL_HEBREW_CATEGORIES = [
  'תנ"ך ומפרשיו',
  'משנה ותוספתא',
  'תלמוד ומפרשיו',
  'מדרש',
  'הלכה',
  'שו"ת',
  'רמב"ם ומפרשיו',
  'קבלה',
  'חסידות',
  'מחשבה ומוסר',
  'תפילה',
  'דרשות',
  'בית שני',
  'מילונים וספרי עזר',
  'שונות',
  'הלכה ומנהג',
  'דרשות ודרושים',
  'ספרות חז"ל',
  'מחשבת ישראל',
  'ספרי מוסר',
  'סדר התפילה',
  'מילונים וספרי יעץ',
  'שאלות ותשובות (שו"ת)',
];

describe('OPDS helpers', () => {
  it('normalises base URL with exactly one trailing slash', () => {
    expect(normaliseBaseUrl('https://host/opds/files')).toBe('https://host/opds/files/');
    expect(normaliseBaseUrl('https://host/opds/files/')).toBe('https://host/opds/files/');
    expect(normaliseBaseUrl('https://host/opds/files///')).toBe('https://host/opds/files/');
  });

  it('creates stable slugs for non-Latin categories', () => {
    expect(categorySlug('בית שני')).toMatch(/^cat-[0-9a-f]{8}$/);
    expect(categorySlug('הלכה ומנהג')).toMatch(/^cat-[0-9a-f]{8}$/);
    expect(categorySlug('בית שני')).not.toBe(categorySlug('הלכה ומנהג'));
  });

  it('avoids slug collisions across the real Hebrew category set', () => {
    const slugs = REAL_HEBREW_CATEGORIES.map(categorySlug);
    expect(new Set(slugs).size).toBe(REAL_HEBREW_CATEGORIES.length);
  });
});

describe('buildOpdsFiles', () => {
  const makeBook = (overrides = {}) => ({
    id: 'dicta:a',
    title: 'א',
    titleEn: null,
    author: null,
    authorEn: null,
    category: 'בית שני',
    subcategory: 'כללי',
    provider: 'dicta',
    kind: 'book',
    sourceUrl: null,
    files: {
      epub: { path: 'dicta/a/a.epub', mime: 'application/epub+zip' },
    },
    ...overrides,
  });

  it('uses normalised base URLs in acquisition links', () => {
    const { files } = buildOpdsFiles({
      exported: [makeBook()],
      baseUrl: 'https://host/opds/files',
      now: new Date('2026-01-01T00:00:00.000Z'),
    });

    expect(files['all.xml']).toContain('href="https://host/opds/files/dicta/a/a.epub"');
  });

  it('creates distinct files for Hebrew categories that formerly collapsed', () => {
    const { categoryFiles } = buildOpdsFiles({
      exported: [
        makeBook({ id: 'dicta:a', category: 'בית שני' }),
        makeBook({ id: 'dicta:b', title: 'ב', category: 'הלכה ומנהג', files: { pdf: { path: 'dicta/b/b.pdf', mime: 'application/pdf' } } }),
      ],
      now: new Date('2026-01-01T00:00:00.000Z'),
    });

    expect(categoryFiles['בית שני']).toBeTruthy();
    expect(categoryFiles['הלכה ומנהג']).toBeTruthy();
    expect(categoryFiles['בית שני']).not.toBe(categoryFiles['הלכה ומנהג']);
  });

  it('fails fast for empty export lists', () => {
    expect(() => buildOpdsFiles({ exported: [] })).toThrow('Manifest has no exported files');
  });
});
