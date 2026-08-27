import { useEffect, useState } from 'react';
import type { Book } from '../lib/types';

const PAGE_SIZE = 40;

interface Props {
  books: Book[];
  onSelect: (book: Book) => void;
}

/** Paginated rather than virtualised: 1007 rows never all need to be live. */
export function BookList({ books, onSelect }: Props) {
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(books.length / PAGE_SIZE));

  // Any change of result set puts us back on the first page.
  useEffect(() => setPage(0), [books]);

  const slice = books.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  if (books.length === 0) {
    return <p className="empty">לא נמצאו ספרים התואמים את החיפוש.</p>;
  }

  return (
    <>
      <div className="book-grid">
        {slice.map((b) => (
          <button type="button" className="book-card" key={b.id} onClick={() => onSelect(b)}>
            <span className="title">{b.title}</span>
            <span className="meta">
              {[b.author, b.place, b.year].filter(Boolean).join(' · ')}
            </span>
            <span className="tags">
              {b.category} · {b.subcategory}
            </span>
          </button>
        ))}
      </div>

      {pages > 1 && (
        <nav className="pager" aria-label="ניווט בין עמודים">
          <button type="button" onClick={() => setPage((p) => p - 1)} disabled={page === 0}>
            הקודם
          </button>
          <span>
            עמוד {page + 1} מתוך {pages}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => p + 1)}
            disabled={page >= pages - 1}
          >
            הבא
          </button>
        </nav>
      )}
    </>
  );
}
