import { useEffect, useMemo, useState } from 'react';
import { BookDetail } from './components/BookDetail';
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
import type { Book, Catalogue } from './lib/types';

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
  const [selected, setSelected] = useState<Book | null>(null);

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}books.json`)
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
      .then(setCatalogue)
      .catch(() => setLoadError('טעינת רשימת הספרים נכשלה.'));
  }, []);

  // Keep the URL in step so a filtered view can be shared or bookmarked.
  useEffect(() => {
    const params = queryToParams(query).toString();
    const url = params ? `?${params}` : window.location.pathname;
    window.history.replaceState(null, '', url);
  }, [query]);

  const results = useMemo(() => {
    if (!catalogue) return [];
    return sortBooks(filterBooks(catalogue.books, query), sort);
  }, [catalogue, query, sort]);

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

            <BookList books={results} onSelect={setSelected} />
          </section>
        </main>
      )}

      {selected && <BookDetail book={selected} onClose={() => setSelected(null)} />}

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
