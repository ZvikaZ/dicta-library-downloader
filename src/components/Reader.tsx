import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getDoc } from '../lib/bookCache';
import { findMatches, segment, type Match } from '../lib/findInText';
import { FORMAT_LABEL } from '../lib/formats';
import { blockText } from '../lib/parseOcr';
import { tocEntries } from '../lib/toc';
import type { Block, Book, BookDoc, ExportFormat } from '../lib/types';

const SIZES = [16, 18, 20, 23, 26];
const DEFAULT_SIZE = 1;

interface Props {
  book: Book;
  onClose: () => void;
  /** Scan folio to open at, from the URL. Takes precedence over the saved spot. */
  initialFolio?: number | null;
  /** Reports the folio now being read, so the URL can cite it. */
  onFolio?: (folio: number) => void;
}

function positionKey(bookId: string): string {
  return `dicta:pos:${bookId}`;
}

function readStored(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null; // private mode, blocked storage
  }
}

function writeStored(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* not worth telling the reader about */
  }
}

/** Render one block, preserving emphasis and highlighting search hits. */
function BlockView({ block, hits }: { block: Block; hits: Match[] }) {
  const children: React.ReactNode[] = [];
  let offset = 0;

  block.spans.forEach((span, i) => {
    if (i > 0) {
      children.push(' ');
      offset += 1; // blockText joins spans with a single space
    }
    const from = offset;
    const to = offset + span.text.length;
    const ranges = hits
      .filter((h) => h.start < to && h.end > from)
      .map((h) => ({ start: Math.max(h.start, from) - from, end: Math.min(h.end, to) - from }));

    const pieces = segment(span.text, ranges).map((seg, k) =>
      seg.hit ? (
        <mark key={`${i}-${k}`}>{seg.text}</mark>
      ) : (
        <span key={`${i}-${k}`}>{seg.text}</span>
      ),
    );
    children.push(span.bold ? <strong key={i}>{pieces}</strong> : <span key={i}>{pieces}</span>);
    offset = to;
  });

  return block.kind === 'heading' ? (
    <h2 className="rd-heading">{children}</h2>
  ) : (
    <p className="rd-para">{children}</p>
  );
}

export function Reader({ book, onClose, initialFolio, onFolio }: Props) {
  const [doc, setDoc] = useState<BookDoc | null>(null);
  const [error, setError] = useState('');
  const [ratio, setRatio] = useState(0);
  const [query, setQuery] = useState('');
  const [hitIndex, setHitIndex] = useState(0);
  const [sizeIndex, setSizeIndex] = useState(DEFAULT_SIZE);
  const [showToc, setShowToc] = useState(false);
  const [busy, setBusy] = useState<ExportFormat | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const restored = useRef(false);

  useEffect(() => {
    let live = true;
    getDoc(book, (_stage, r) => live && setRatio(r))
      .then((d) => live && setDoc(d))
      .catch((e) => live && setError(e instanceof Error ? e.message : 'טעינת הספר נכשלה.'));
    return () => {
      live = false;
    };
  }, [book]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === '/' && e.target === document.body) {
        e.preventDefault();
        document.getElementById('rd-search')?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const plain = useMemo(() => (doc ? doc.blocks.map(blockText) : []), [doc]);
  const matches = useMemo(() => findMatches(plain, query), [plain, query]);
  const entries = useMemo(() => (doc ? tocEntries(doc) : []), [doc]);

  const hitsByBlock = useMemo(() => {
    const m = new Map<number, Match[]>();
    for (const hit of matches) {
      const list = m.get(hit.block);
      if (list) list.push(hit);
      else m.set(hit.block, [hit]);
    }
    return m;
  }, [matches]);

  const scrollToBlock = useCallback((index: number) => {
    document.getElementById(`rd-b${index}`)?.scrollIntoView({ block: 'center' });
  }, []);

  // Open where asked: a folio in the link wins over the remembered spot,
  // because an explicit link is a deliberate request.
  useEffect(() => {
    if (!doc || restored.current) return;
    restored.current = true;

    if (initialFolio) {
      const at = doc.blocks.findIndex((b) => b.page === initialFolio);
      if (at >= 0) {
        requestAnimationFrame(() => scrollToBlock(at));
        return;
      }
    }
    const saved = Number(readStored(positionKey(book.id)));
    if (Number.isFinite(saved) && saved > 0) {
      requestAnimationFrame(() => scrollToBlock(saved));
    }
  }, [doc, book.id, initialFolio, scrollToBlock]);

  // Remember roughly where the reader stopped.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !doc) return;
    let timer = 0;
    const onScroll = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const mid = el.scrollTop + el.clientHeight / 2;
        const blocks = el.querySelectorAll<HTMLElement>('[data-block]');
        for (const node of blocks) {
          if (node.offsetTop + node.offsetHeight >= mid) {
            writeStored(positionKey(book.id), node.dataset.block ?? '0');
            const folio = Number(node.dataset.folio);
            if (Number.isFinite(folio)) onFolio?.(folio);
            break;
          }
        }
      }, 400);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll);
      window.clearTimeout(timer);
    };
  }, [doc, book.id, onFolio]);

  useEffect(() => setHitIndex(0), [query]);

  useEffect(() => {
    if (matches.length > 0) scrollToBlock(matches[Math.min(hitIndex, matches.length - 1)].block);
  }, [hitIndex, matches, scrollToBlock]);

  const download = async (format: ExportFormat) => {
    if (!doc) return;
    setBusy(format);
    try {
      const { exportBook } = await import('../lib/exporter');
      await exportBook(book, format);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ההמרה נכשלה.');
    } finally {
      setBusy(null);
    }
  };

  const step = (delta: number) => {
    if (matches.length === 0) return;
    setHitIndex((i) => (i + delta + matches.length) % matches.length);
  };

  let lastPage = -1;

  return (
    <div className="reader" role="dialog" aria-modal="true" aria-label={book.title}>
      <header className="rd-bar">
        <button type="button" className="rd-btn" onClick={onClose} aria-label="סגירה">
          ←
        </button>
        {/* Just the title: the front matter below carries the full details,
            and this bar only has to say which book you are in. */}
        <div className="rd-title">
          <strong>{book.title}</strong>
        </div>

        <div className="rd-search">
          <input
            id="rd-search"
            type="search"
            placeholder="חיפוש בספר…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && step(e.shiftKey ? -1 : 1)}
          />
          {query.trim().length > 1 && (
            <span className="rd-count">
              {matches.length === 0 ? 'אין תוצאות' : `${hitIndex + 1}/${matches.length}`}
            </span>
          )}
          {matches.length > 0 && (
            <>
              <button type="button" className="rd-btn" onClick={() => step(-1)} aria-label="הקודם">
                ‹
              </button>
              <button type="button" className="rd-btn" onClick={() => step(1)} aria-label="הבא">
                ›
              </button>
            </>
          )}
        </div>

        <div className="rd-tools">
          <button
            type="button"
            className="rd-btn"
            onClick={() => setSizeIndex((i) => Math.max(0, i - 1))}
            aria-label="הקטנת טקסט"
          >
            א−
          </button>
          <button
            type="button"
            className="rd-btn"
            onClick={() => setSizeIndex((i) => Math.min(SIZES.length - 1, i + 1))}
            aria-label="הגדלת טקסט"
          >
            א+
          </button>
          {entries.length > 0 && (
            <button type="button" className="rd-btn" onClick={() => setShowToc((v) => !v)}>
              תוכן
            </button>
          )}
          {(['epub', 'docx', 'pdf'] as ExportFormat[]).map((f) => (
            <button
              type="button"
              key={f}
              className="rd-btn"
              disabled={busy !== null || !doc}
              onClick={() => download(f)}
            >
              {busy === f ? '…' : FORMAT_LABEL[f]}
            </button>
          ))}
        </div>
      </header>

      <div className="rd-body">
        {showToc && entries.length > 0 && (
          <nav className="rd-toc" aria-label="תוכן העניינים">
            <ol>
              {entries.map((e) => (
                <li key={e.id}>
                  <button
                    type="button"
                    onClick={() => {
                      const at = doc?.blocks.findIndex(
                        (b, bi) => b.kind === 'heading' && `h${bi}` === e.id,
                      );
                      if (at !== undefined && at >= 0) scrollToBlock(at);
                      setShowToc(false);
                    }}
                  >
                    <span>{e.text}</span>
                    <span className="rd-folio">{e.page}</span>
                  </button>
                </li>
              ))}
            </ol>
          </nav>
        )}

        <div className="rd-scroll" ref={scrollRef} style={{ fontSize: SIZES[sizeIndex] }}>
          {/* Drawn from the catalogue, so the book identifies itself straight
              away while the text is still on its way. */}
          <header className="rd-front">
            <h1>{book.title}</h1>
            {book.author && <p className="rd-front-author">{book.author}</p>}
            <p className="rd-front-meta">
              {[book.place, book.year, book.category, book.subcategory]
                .filter(Boolean)
                .join(' · ')}
            </p>
            {book.titleEn && <p className="rd-front-meta">{book.titleEn}</p>}
          </header>

          {error && <p className="rd-msg rd-error">{error}</p>}
          {!doc && !error && (
            <p className="rd-msg">
              מוריד את הספר… {ratio > 0 && `${Math.round(ratio * 100)}%`}
            </p>
          )}

          {doc && (
            <article className="rd-text">
              {doc.blocks.map((block, i) => {
                const newPage = block.page !== lastPage;
                if (newPage) lastPage = block.page;
                return (
                  <div
                    key={i}
                    id={`rd-b${i}`}
                    data-block={i}
                    data-folio={block.page}
                    className="rd-block"
                  >
                    {newPage && <span className="rd-pagemark">{block.page}</span>}
                    <BlockView block={block} hits={hitsByBlock.get(i) ?? []} />
                  </div>
                );
              })}
              <p className="rd-colophon">
                הטקסט באדיבות{' '}
                <a href="https://library.dicta.org.il" target="_blank" rel="noreferrer">
                  הספרייה של דיקטה
                </a>{' '}
                · רישיון{' '}
                <a
                  href="https://creativecommons.org/licenses/by-sa/4.0/"
                  target="_blank"
                  rel="noreferrer"
                >
                  CC BY-SA 4.0
                </a>{' '}
                · <a href={book.textUrl}>הורדת מקור הטקסט</a>
                <br />
                הטקסט הופק בזיהוי תווים אוטומטי וייתכנו בו שיבושים. ללא ניקוד.
              </p>
            </article>
          )}
        </div>
      </div>
    </div>
  );
}
