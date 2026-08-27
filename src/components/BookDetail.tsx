import { useEffect, useRef, useState } from 'react';
import { FORMAT_HINT, FORMAT_LABEL } from '../lib/formats';
import type { Book, ExportFormat } from '../lib/types';

const DICTA_SITE = 'https://library.dicta.org.il';
const CC_BY_SA = 'https://creativecommons.org/licenses/by-sa/4.0/';

interface Props {
  book: Book;
  onClose: () => void;
}

const STAGE_TEXT = {
  download: 'מוריד את הטקסט מדיקטה…',
  parse: 'מפרק את הארכיון…',
  build: 'בונה את הקובץ…',
} as const;

export function BookDetail({ book, onClose }: Props) {
  const [busy, setBusy] = useState<ExportFormat | null>(null);
  const [status, setStatus] = useState('');
  const [ratio, setRatio] = useState(0);
  const [error, setError] = useState('');
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const run = async (format: ExportFormat) => {
    setBusy(format);
    setError('');
    setRatio(0);
    try {
      // The EPUB/DOCX builders are ~400 kB; browsing the catalogue should not
      // pay for them, so they load on the first download instead.
      const { exportBook } = await import('../lib/exporter');
      await exportBook(book, format, (stage, r) => {
        setStatus(STAGE_TEXT[stage]);
        setRatio(stage === 'download' ? r : 1);
      });
      setStatus(format === 'print' ? 'נפתח חלון הדפסה.' : 'הקובץ ירד.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ההמרה נכשלה.');
      setStatus('');
    } finally {
      setBusy(null);
    }
  };

  const rows: [string, string | number | null][] = [
    ['מחבר', book.author],
    ['Author', book.authorEn],
    ['קטגוריה', book.category],
    ['תת־קטגוריה', book.subcategory],
    ['מקום דפוס', book.place],
    ['שנת דפוס', book.year],
    ['מקור', book.source],
  ];

  return (
    <div
      className="backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={book.title}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="sheet">
        <button type="button" className="close" onClick={onClose} aria-label="סגירה" ref={closeRef}>
          ×
        </button>
        <h2>{book.title}</h2>
        <p className="byline">{book.titleEn}</p>

        <table className="detail-table">
          <tbody>
            {rows
              .filter(([, v]) => v !== null && v !== '')
              .map(([k, v]) => (
                <tr key={k}>
                  <th scope="row">{k}</th>
                  <td>{v}</td>
                </tr>
              ))}
          </tbody>
        </table>

        <div className="download-row">
          {(['epub', 'docx', 'print'] as ExportFormat[]).map((f) => (
            <button
              type="button"
              key={f}
              className={f === 'epub' ? 'dl' : 'dl secondary'}
              disabled={busy !== null}
              onClick={() => run(f)}
              title={FORMAT_HINT[f]}
            >
              {busy === f ? '…' : FORMAT_LABEL[f]}
            </button>
          ))}
        </div>

        {busy && (
          <div className="progress" role="progressbar" aria-valuenow={Math.round(ratio * 100)}>
            <div style={{ width: `${Math.max(4, ratio * 100)}%` }} />
          </div>
        )}
        <p className={error ? 'status error' : 'status'} role="status">
          {error || status}
        </p>

        <div className="sheet-foot">
          <p style={{ margin: '0 0 6px' }}>
            הטקסט מופק בזיהוי תווים אוטומטי וייתכנו בו שיבושים. הקבצים מיוצרים ללא ניקוד.
          </p>
          <p style={{ margin: 0 }}>
            הטקסט באדיבות{' '}
            <a href={DICTA_SITE} target="_blank" rel="noreferrer">
              הספרייה של דיקטה
            </a>{' '}
            · רישיון{' '}
            <a href={CC_BY_SA} target="_blank" rel="noreferrer">
              CC BY-SA 4.0
            </a>{' '}
            ·{' '}
            <a href={book.textUrl}>הורדת מקור הטקסט</a>
          </p>
        </div>
      </div>
    </div>
  );
}
