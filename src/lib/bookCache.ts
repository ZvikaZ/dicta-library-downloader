import { loadBook } from './providers';
import type { Progress } from './providers/types';
import type { Book, BookDoc } from './types';

/**
 * Parsed books, kept for the session.
 *
 * Deliberately separate from the exporter: the reader needs a parsed book but
 * not the EPUB/DOCX/PDF builders, and those are ~1.5 MB of lazy chunk. Reading
 * a book you already exported (or vice versa) costs nothing the second time.
 */
const cache = new Map<string, BookDoc>();

export async function getDoc(book: Book, onProgress?: Progress): Promise<BookDoc> {
  const hit = cache.get(book.id);
  if (hit) return hit;
  const doc = await loadBook(book, onProgress);
  cache.set(book.id, doc);
  return doc;
}

export function cached(bookId: string): BookDoc | undefined {
  return cache.get(bookId);
}
