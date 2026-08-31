import { describe, expect, it } from 'vitest';
import { mergeCatalogues, providerLabel } from './catalogue';
import { EMPTY_QUERY, filterBooks, paramsToQuery, queryToParams } from './search';
import { makeBook } from '../test/fixtures';
import type { Catalogue } from './types';

const dicta: Catalogue = {
  facets: {
    categories: [{ name: 'הלכה', count: 2 }],
    subcategories: [{ name: 'אחרונים', count: 2 }],
    total: 2,
    fetchedAt: '2026-08-27',
  },
  books: [
    makeBook({ id: 'dicta:a', category: 'הלכה', subcategory: 'אחרונים', year: 1800 }),
    makeBook({ id: 'dicta:b', category: 'הלכה', subcategory: 'אחרונים', year: 1900 }),
  ],
};

const sefaria: Catalogue = {
  facets: {
    categories: [{ name: 'הלכה', count: 1 }],
    subcategories: [{ name: 'אחרונים', count: 1 }],
    total: 1,
    fetchedAt: '2026-08-31',
  },
  books: [
    makeBook({
      id: 'sefaria:Shulchan Arukh, Orach Chayim',
      provider: 'sefaria',
      category: 'הלכה',
      // Not משנה תורה: that subcategory re-homes to the Rambam shelf, which is
      // ./categories' business, not this test's.
      subcategory: 'אחרונים',
      year: 1176,
    }),
  ],
};

describe('merging the libraries', () => {
  const merged = mergeCatalogues([dicta, sefaria]);

  it('keeps every book', () => {
    expect(merged.books).toHaveLength(3);
    expect(merged.facets.total).toBe(3);
  });

  // Each library counts its facets over its own books, so concatenating the
  // shipped lists would show הלכה twice with the wrong counts.
  it('re-counts a category that appears in both, rather than listing it twice', () => {
    expect(merged.facets.categories).toEqual([{ name: 'הלכה', count: 3 }]);
  });

  it('reports the older refresh, which every book is at least as new as', () => {
    expect(merged.facets.fetchedAt).toBe('2026-08-27');
  });

  it('counts the books each library contributed', () => {
    expect(merged.facets.sources).toEqual([
      { name: providerLabel('dicta'), count: 2 },
      { name: providerLabel('sefaria'), count: 1 },
    ]);
  });

  it('survives a library being empty', () => {
    const alone = mergeCatalogues([
      dicta,
      { facets: { ...sefaria.facets, total: 0 }, books: [] },
    ]);
    expect(alone.books).toHaveLength(2);
    expect(alone.facets.categories).toEqual([{ name: 'הלכה', count: 2 }]);
  });
});

describe('filtering by library', () => {
  const { books } = mergeCatalogues([dicta, sefaria]);

  it('narrows to one library', () => {
    const only = filterBooks(books, { ...EMPTY_QUERY, sources: [providerLabel('sefaria')] });
    expect(only.map((b) => b.id)).toEqual(['sefaria:Shulchan Arukh, Orach Chayim']);
  });

  it('leaves the list alone when nothing is picked', () => {
    expect(filterBooks(books, EMPTY_QUERY)).toHaveLength(3);
  });

  it('survives a round trip through the URL, so the view can be shared', () => {
    const query = { ...EMPTY_QUERY, sources: [providerLabel('dicta'), providerLabel('sefaria')] };
    expect(paramsToQuery(queryToParams(query)).sources).toEqual(query.sources);
  });
});
