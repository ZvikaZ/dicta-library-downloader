import { describe, expect, it } from 'vitest';
import { CATEGORIES, canonicalCategory, categoryOrder } from './categories';
import { makeBook } from '../test/fixtures';
import type { Book, Provider } from './types';

const book = (provider: Provider, category: string, subcategory = ''): Book =>
  makeBook({ id: `${provider}:x`, provider, category, subcategory });

describe('one vocabulary across libraries', () => {
  // The pairs that made the merged sidebar unusable: picking one silently
  // excluded the other library's half of the same subject.
  it.each([
    ['שאלות ותשובות (שו"ת)', 'שו"ת', 'שו"ת'],
    ['הלכה ומנהג', 'הלכה', 'הלכה'],
    ['תלמוד ומפרשיו', 'תלמוד', 'תלמוד ומפרשיו'],
    ['תנ"ך ומפרשיו', 'תנ"ך', 'תנ"ך ומפרשיו'],
  ])('maps Dicta %s and Sefaria %s both onto %s', (dicta, sefaria, unified) => {
    expect(canonicalCategory(book('dicta', dicta))).toBe(unified);
    expect(canonicalCategory(book('sefaria', sefaria))).toBe(unified);
  });

  it('gathers the two Sefaria thought categories with Dicta\'s one', () => {
    expect(canonicalCategory(book('sefaria', 'מחשבת ישראל'))).toBe('מחשבה ומוסר');
    expect(canonicalCategory(book('sefaria', 'ספרי מוסר'))).toBe('מחשבה ומוסר');
    expect(canonicalCategory(book('dicta', 'מחשבה ומוסר'))).toBe('מחשבה ומוסר');
  });

  it('puts Mishnah and Tosefta on one shelf', () => {
    expect(canonicalCategory(book('sefaria', 'משנה'))).toBe('משנה ותוספתא');
    expect(canonicalCategory(book('sefaria', 'תוספתא'))).toBe('משנה ותוספתא');
  });
});

describe('where the subcategory overrules the category', () => {
  // Sefaria splits the Mishneh Torah into 90 sections filed under הלכה; Dicta
  // gives the Rambam's commentators a shelf of their own.
  it('puts the Mishneh Torah with its commentators', () => {
    expect(canonicalCategory(book('sefaria', 'הלכה', 'משנה תורה'))).toBe('רמב"ם ומפרשיו');
    expect(canonicalCategory(book('dicta', 'רמב"ם ומפרשיו', 'מפרשי הרמב"ם - מערב'))).toBe(
      'רמב"ם ומפרשיו',
    );
  });

  it('leaves the rest of Sefaria הלכה where it is', () => {
    expect(canonicalCategory(book('sefaria', 'הלכה', 'טור'))).toBe('הלכה');
    expect(canonicalCategory(book('sefaria', 'הלכה', 'אחרונים'))).toBe('הלכה');
  });

  // Dicta's שונות is a mixed bag; two of its subcategories are subjects both
  // libraries otherwise name in their own right.
  it('rescues prayer and books of the commandments from שונות', () => {
    expect(canonicalCategory(book('dicta', 'שונות', 'תפילה'))).toBe('תפילה');
    expect(canonicalCategory(book('dicta', 'שונות', 'ספרי מצוות'))).toBe('הלכה');
    expect(canonicalCategory(book('dicta', 'שונות', 'ביאורים וליקוטים'))).toBe('שונות');
  });

  it('files Yerushalmi commentary with the Talmud', () => {
    expect(canonicalCategory(book('dicta', 'ספרות חז"ל', 'מפרשי הירושלמי'))).toBe(
      'תלמוד ומפרשיו',
    );
    expect(canonicalCategory(book('dicta', 'ספרות חז"ל', 'מפרשי המשנה (אחרונים)'))).toBe(
      'משנה ותוספתא',
    );
  });

  // Several subcategory names arrive with a stray trailing space.
  it('is not defeated by whitespace in the source data', () => {
    expect(canonicalCategory(book('dicta', 'ספרות חז"ל', 'מפרשי הירושלמי '))).toBe(
      'תלמוד ומפרשיו',
    );
  });
});

describe('categories that are not in the map', () => {
  // A library that adds a category should appear in the sidebar, not vanish
  // into a catch-all where nobody notices it.
  it('passes an unknown category through unchanged', () => {
    expect(canonicalCategory(book('dicta', 'קטגוריה חדשה'))).toBe('קטגוריה חדשה');
    expect(canonicalCategory(book('sefaria', 'Something New'))).toBe('Something New');
  });

  it('sorts an unknown category last, after the known ones', () => {
    expect(categoryOrder('קטגוריה חדשה')).toBeGreaterThanOrEqual(CATEGORIES.length);
    expect(categoryOrder('תנ"ך ומפרשיו')).toBe(0);
  });
});
