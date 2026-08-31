import type { Book, ExportFormat } from './types';

// Characters Windows, macOS and Linux disallow in file names, plus control
// characters. Hebrew letters are fine everywhere — only these need removing.
const ILLEGAL = /[\/:*?"<>|\u0000-\u001f]/g;

// Windows refuses these names regardless of extension.
const RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)$/i;

const EXTENSION: Record<ExportFormat, string> = {
  epub: 'epub',
  docx: 'docx',
  pdf: 'pdf',
};

/**
 * Name downloads after the book's Hebrew title rather than Dicta's internal
 * slug, so a shelf of these files is readable.
 */
export function downloadName(book: Book, format: ExportFormat): string {
  let base = (book.title ?? '')
    .replace(ILLEGAL, '')
    // A trailing dot or space is silently stripped by Windows.
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/, '');

  // The id is provider-prefixed (`dicta:alfeimenashe`), and a colon is
  // illegal in a file name on Windows.
  if (!base || RESERVED.test(base)) base = book.id.replace(ILLEGAL, '-');
  // Leave room for the extension and for long paths; 120 chars is well within
  // every filesystem's per-component limit.
  if (base.length > 120) base = base.slice(0, 120).trim();

  return `${base}.${EXTENSION[format]}`;
}
