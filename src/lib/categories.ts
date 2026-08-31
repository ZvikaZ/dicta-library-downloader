import type { Book } from './types';

/**
 * One category vocabulary across every library.
 *
 * The libraries classify differently, and both are internally consistent: Dicta
 * catalogues printed volumes by genre *and by what they comment on*
 * (`תלמוד ומפרשיו`, `רמב"ם ומפרשיו`), while Sefaria catalogues primary texts by
 * canonical corpus (`תלמוד`, `משנה`, `תוספתא`). Merged raw, the sidebar showed 24
 * categories including near-duplicate pairs — `הלכה` beside `הלכה ומנהג`, `שו"ת`
 * beside `שאלות ותשובות (שו"ת)` — where picking one silently excluded half the
 * shelf.
 *
 * So both are mapped onto a single list, by subject. The mapping is applied when
 * the catalogues are merged, not when they are fetched: each library's own file
 * keeps its own vocabulary, which is its data to describe as it likes.
 */
export const CATEGORIES = [
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
] as const;

export type Category = (typeof CATEGORIES)[number];

/** Straight category renames, per library. */
const BY_CATEGORY: Record<string, Record<string, Category>> = {
  dicta: {
    'תנ"ך ומפרשיו': 'תנ"ך ומפרשיו',
    'תלמוד ומפרשיו': 'תלמוד ומפרשיו',
    'ספרות חז"ל': 'משנה ותוספתא',
    'הלכה ומנהג': 'הלכה',
    'רמב"ם ומפרשיו': 'רמב"ם ומפרשיו',
    'שאלות ותשובות (שו"ת)': 'שו"ת',
    קבלה: 'קבלה',
    חסידות: 'חסידות',
    'מחשבה ומוסר': 'מחשבה ומוסר',
    'דרשות ודרושים': 'דרשות',
    שונות: 'שונות',
    כללי: 'שונות',
  },
  sefaria: {
    'תנ"ך': 'תנ"ך ומפרשיו',
    משנה: 'משנה ותוספתא',
    תוספתא: 'משנה ותוספתא',
    תלמוד: 'תלמוד ומפרשיו',
    מדרש: 'מדרש',
    הלכה: 'הלכה',
    'שו"ת': 'שו"ת',
    קבלה: 'קבלה',
    חסידות: 'חסידות',
    'מחשבת ישראל': 'מחשבה ומוסר',
    'ספרי מוסר': 'מחשבה ומוסר',
    'סדר התפילה': 'תפילה',
    'בית שני': 'בית שני',
    'מילונים וספרי יעץ': 'מילונים וספרי עזר',
  },
};

/**
 * Where a library's own category is too coarse, the subcategory decides.
 *
 * Dicta files prayer books and books of the commandments under `שונות`, which
 * both libraries otherwise treat as subjects of their own; its `ספרות חז"ל`
 * holds Yerushalmi commentary, which belongs with the Talmud; and Sefaria files
 * the Mishneh Torah under `הלכה`, away from its own commentators.
 */
const BY_SUBCATEGORY: Record<string, Record<string, Category>> = {
  dicta: {
    'שונות/תפילה': 'תפילה',
    'שונות/ספרי מצוות': 'הלכה',
    'ספרות חז"ל/מפרשי הירושלמי': 'תלמוד ומפרשיו',
  },
  sefaria: {
    // Sefaria splits the Mishneh Torah into 90 addressable sections and files
    // them under הלכה. Dicta gives the Rambam's commentators a shelf of their
    // own; putting the work itself on it keeps the two together.
    'הלכה/משנה תורה': 'רמב"ם ומפרשיו',
  },
};

/** Some subcategory names carry a stray trailing space in the source data. */
const clean = (s: string) => (s ?? '').trim();

export function canonicalCategory(book: Book): string {
  const category = clean(book.category);
  const subcategory = clean(book.subcategory);

  const bySub = BY_SUBCATEGORY[book.provider]?.[`${category}/${subcategory}`];
  if (bySub) return bySub;

  // An unmapped category passes through unchanged rather than vanishing into a
  // catch-all: a library that adds one should show up, not go quietly missing.
  return BY_CATEGORY[book.provider]?.[category] ?? category;
}

/** Chronological-ish by corpus, then by subject — never by size. */
const ORDER = new Map(CATEGORIES.map((c, i) => [c as string, i]));

export function categoryOrder(name: string): number {
  return ORDER.get(name) ?? CATEGORIES.length;
}
