import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { BookList } from './components/BookList';
import { Filters } from './components/Filters';
import {
  availableSubcategories,
  EMPTY_QUERY,
  filterBooks,
  isActive,
  paramsToQuery,
  queryToParams,
  sortBooks,
  type Query,
  type SortKey,
} from './lib/search';
import type { Catalogue } from './lib/types';

// The reader carries the zip reader and parser with it; browsing the catalogue
// should not pay for that until a book is actually opened.
const Reader = lazy(() =>
  import('./components/Reader').then((m) => ({ default: m.Reader })),
);

function folioFromParams(params: URLSearchParams): number | null {
  const n = Number(params.get('p'));
  return Number.isFinite(n) && n > 0 ? n : null;
}

const DICTA_SITE = 'https://library.dicta.org.il';
const DICTA_REPO =
  'https://github.com/Dicta-Israel-Center-for-Text-Analysis/Dicta-Library-Download';
const CC_BY_SA = 'https://creativecommons.org/licenses/by-sa/4.0/';

export function App() {
  const [catalogue, setCatalogue] = useState<Catalogue | null>(null);
  const [loadError, setLoadError] = useState('');
  const [query, setQuery] = useState<Query>(() =>
    paramsToQuery(new URLSearchParams(window.location.search)),
  );
  const [sort, setSort] = useState<SortKey>('title');
  // Seeded from the URL at mount, not after the catalogue arrives: the effect
  // that syncs the URL runs on the first render too, and would otherwise strip
  // `read` before anything had a chance to restore it.
  const [readingId, setReadingId] = useState<string | null>(() =>
    new URLSearchParams(window.location.search).get('read'),
  );
  // The scan folio, so a link can cite the same place the PDF and Word margins
  // print — not our own pagination, which would not survive a reformat.
  const [readingFolio, setReadingFolio] = useState<number | null>(() =>
    folioFromParams(new URLSearchParams(window.location.search)),
  );

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}books.json`)
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
      .then(setCatalogue)
      .catch(() => setLoadError('טעינת רשימת הספרים נכשלה.'));
  }, []);

  // Back, forward and any other outside change to the URL.
  useEffect(() => {
    const onPop = () => {
      const params = new URLSearchParams(window.location.search);
      setQuery(paramsToQuery(params));
      setReadingId(params.get('read'));
      setReadingFolio(folioFromParams(params));
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // Keep the URL in step so a filtered view can be shared or bookmarked.
  useEffect(() => {
    const params = queryToParams(query);
    if (readingId) params.set('read', readingId);
    if (readingId && readingFolio) params.set('p', String(readingFolio));
    const search = params.toString();
    window.history.replaceState(null, '', search ? `?${search}` : window.location.pathname);
  }, [query, readingId, readingFolio]);

  const results = useMemo(() => {
    if (!catalogue) return [];
    return sortBooks(filterBooks(catalogue.books, query), sort);
  }, [catalogue, query, sort]);

  // A book opened for reading is addressable, so a link points at the text.
  const reading = useMemo(
    () => (catalogue && readingId ? (catalogue.books.find((b) => b.id === readingId) ?? null) : null),
    [catalogue, readingId],
  );

  // Drop an id that matches nothing, so the URL does not keep a dead param.
  useEffect(() => {
    if (catalogue && readingId && !reading) setReadingId(null);
  }, [catalogue, readingId, reading]);

  const subs = useMemo(
    () => (catalogue ? availableSubcategories(catalogue.books, query) : []),
    [catalogue, query],
  );

  return (
    <>
      <header className="masthead">
        <div className="masthead-inner">
          <h1>הספרייה של דיקטה — הורדה</h1>
          <p className="tagline">עיון וחיפוש בקטלוג, והורדה כ‑EPUB, Word או PDF</p>
          <p className="credit">
            כל הטקסטים באדיבות{' '}
            <a href={DICTA_SITE} target="_blank" rel="noreferrer">
              הספרייה של דיקטה
            </a>
            , המרכז הישראלי לניתוח טקסטים. תודה על המיזם ועל שחרור הטקסטים לשימוש חופשי.
          </p>
        </div>
      </header>

      {loadError && <p className="empty">{loadError}</p>}

      {catalogue && (
        <main className="layout">
          <Filters
            facets={catalogue.facets}
            subcategories={subs}
            query={query}
            onChange={setQuery}
          />

          <section>
            <div className="toolbar">
              <span className="result-count">
                {results.length.toLocaleString('he-IL')} ספרים
                {isActive(query) && ` מתוך ${catalogue.facets.total.toLocaleString('he-IL')}`}
              </span>
              {isActive(query) && (
                <button type="button" className="link-button" onClick={() => setQuery(EMPTY_QUERY)}>
                  ניקוי הסינון
                </button>
              )}
              <label style={{ marginInlineStart: 'auto', display: 'flex', gap: 8 }}>
                <span className="result-count">מיון</span>
                <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
                  <option value="title">לפי שם</option>
                  <option value="author">לפי מחבר</option>
                  <option value="year">לפי שנה</option>
                </select>
              </label>
            </div>

            {/* Selecting a book opens it; the downloads live in the reader. */}
            <BookList
              books={results}
              onSelect={(b) => {
                setReadingId(b.id);
                setReadingFolio(null);
              }}
            />
          </section>
        </main>
      )}

      {reading && (
        <Suspense fallback={<p className="empty">טוען…</p>}>
          <Reader
            book={reading}
            initialFolio={readingFolio}
            onFolio={setReadingFolio}
            onClose={() => {
              setReadingId(null);
              setReadingFolio(null);
            }}
          />
        </Suspense>
      )}

      <footer className="site-foot">
        <p style={{ margin: '0 0 6px' }}>
          הטקסטים והנתונים הם מיזם של{' '}
          <a href={DICTA_SITE} target="_blank" rel="noreferrer">
            דיקטה — המרכז הישראלי לניתוח טקסטים
          </a>
          , המנגיש טקסטים תורניים לציבור ללא עלות. אתר זה הוא ממשק הורדה בלבד ואינו קשור רשמית
          לדיקטה.
        </p>
        <p style={{ margin: 0 }}>
          נתונים:{' '}
          <a href={DICTA_REPO} target="_blank" rel="noreferrer">
            Dicta-Library-Download
          </a>{' '}
          · רישיון{' '}
          <a href={CC_BY_SA} target="_blank" rel="noreferrer">
            CC BY-SA 4.0
          </a>
          {catalogue && ` · הקטלוג עודכן ${catalogue.facets.fetchedAt}`}
        </p>
      </footer>
    </>
  );
}
