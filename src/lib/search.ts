import type { Book } from './types';

// Hebrew points/accents, plus the geresh/gershayim variants that otherwise make
// אלפי מנשה עה"ת unmatchable by anyone typing a plain apostrophe (or nothing).
const NIKUD = /[֑-ׇ]/g;
const MARKS = /[׳״"'`‘’“”]/g;

export function normalise(value: string | null | undefined): string {
  return (value ?? '')
    .replace(NIKUD, '')
    .replace(MARKS, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export interface Query {
  text: string;
  categories: string[];
  subcategories: string[];
  years: [number, number] | null;
}

export const EMPTY_QUERY: Query = { text: '', categories: [], subcategories: [], years: null };

export function isActive(q: Query): boolean {
  return (
    q.text.trim() !== '' ||
    q.categories.length > 0 ||
    q.subcategories.length > 0 ||
    q.years !== null
  );
}

/** Every whitespace-separated term must appear; order does not matter. */
export function matchesText(book: Book, text: string): boolean {
  const terms = normalise(text).split(' ').filter(Boolean);
  if (terms.length === 0) return true;
  return terms.every((t) => book.key.includes(t));
}

export function filterBooks(books: Book[], q: Query): Book[] {
  const terms = normalise(q.text).split(' ').filter(Boolean);
  const cats = new Set(q.categories);
  const subs = new Set(q.subcategories);

  return books.filter((b) => {
    if (cats.size && !cats.has(b.category)) return false;
    if (subs.size && !subs.has(b.subcategory)) return false;
    if (q.years) {
      // Books with an unparseable year are excluded once a range is applied.
      if (b.year === null) return false;
      if (b.year < q.years[0] || b.year > q.years[1]) return false;
    }
    return terms.every((t) => b.key.includes(t));
  });
}

export type SortKey = 'title' | 'year' | 'author';

export function sortBooks(books: Book[], key: SortKey): Book[] {
  const he = new Intl.Collator('he');
  return [...books].sort((a, b) => {
    if (key === 'year') return (a.year ?? 9999) - (b.year ?? 9999) || he.compare(a.title, b.title);
    if (key === 'author') return he.compare(a.author ?? '', b.author ?? '') || he.compare(a.title, b.title);
    return he.compare(a.title, b.title);
  });
}

/** Subcategories present in the books that pass everything except the subcategory filter. */
export function availableSubcategories(books: Book[], q: Query): string[] {
  const scoped = filterBooks(books, { ...q, subcategories: [] });
  return [...new Set(scoped.map((b) => b.subcategory))].sort(new Intl.Collator('he').compare);
}

/** Encode/decode query state in the URL so a filtered view is shareable. */
export function queryToParams(q: Query): URLSearchParams {
  const p = new URLSearchParams();
  if (q.text.trim()) p.set('q', q.text.trim());
  if (q.categories.length) p.set('cat', q.categories.join('|'));
  if (q.subcategories.length) p.set('sub', q.subcategories.join('|'));
  if (q.years) p.set('years', q.years.join('-'));
  return p;
}

export function paramsToQuery(p: URLSearchParams): Query {
  const years = p.get('years');
  const parsed = years?.match(/^(\d{3,4})-(\d{3,4})$/);
  return {
    text: p.get('q') ?? '',
    categories: p.get('cat')?.split('|').filter(Boolean) ?? [],
    subcategories: p.get('sub')?.split('|').filter(Boolean) ?? [],
    years: parsed ? [Number(parsed[1]), Number(parsed[2])] : null,
  };
}
