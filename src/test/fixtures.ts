import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DICTA_ATTRIBUTION } from '../lib/attribution';
import type { Book, BookDoc } from '../lib/types';

/**
 * Ten real OCR pages from אלפי מנשה חלק א, as published by Dicta (CC BY-SA 4.0).
 *
 * Resolved from the working directory rather than `import.meta.url`: under the
 * jsdom environment that URL is an http: one, which `fileURLToPath` rejects.
 */
export function sampleArchive(): Uint8Array {
  return new Uint8Array(readFileSync(resolve('src/test/fixtures/alfeimenashe-sample.zip')));
}

export const alfeiMenashe: Book = {
  id: 'dicta:alfeimenashe',
  provider: 'dicta',
  kind: 'book',
  title: 'אלפי מנשה חלק א',
  titleEn: 'Alfei Menashe part 1',
  author: 'מנשה בן יוסף מאילייה בן פורת',
  authorEn: 'Menashe ben porat',
  category: 'מחשבה ומוסר',
  categoryEn: 'Jewish Thought and Ethics',
  subcategory: 'מחשבה (אחרונים)',
  subcategoryEn: 'Jewish Thought (Acharonim)',
  place: 'וילנה',
  placeEn: 'Vilna (Vilnius)',
  year: 1880,
  source: 'ספריית דיקטה',
  reviewed: true,
  ref: 'https://files.dicta.org.il/library-1-0/alfeimenashe/alfeimenashe__ocr_data_html_files.zip',
  sourceUrl:
    'https://files.dicta.org.il/library-1-0/alfeimenashe/alfeimenashe__text_files.zip',
  key: 'אלפי מנשה חלק א alfei menashe part 1 מנשה בן יוסף מאילייה בן פורת menashe ben porat וילנה',
};

/** A BookDoc with the fields every renderer needs, for tests that only care
 * about the blocks. */
export function makeDoc(over: Partial<BookDoc> & Pick<BookDoc, 'blocks'>): BookDoc {
  return {
    pageCount: 1,
    fidelity: 'pages',
    attribution: DICTA_ATTRIBUTION,
    ...over,
  };
}

export function makeBook(overrides: Partial<Book> & { id: string }): Book {
  return { ...alfeiMenashe, ...overrides };
}
