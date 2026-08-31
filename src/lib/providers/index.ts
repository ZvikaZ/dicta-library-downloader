import type { Book, BookDoc } from '../types';
import type { Provider } from './registry';
import { loadBook as dicta } from './dicta';
import type { LoadBook, Progress } from './types';

const LOADERS: Record<Provider, LoadBook> = {
  dicta,
  // Sefaria's loader pulls a chain of API calls and is only needed once one of
  // its books is opened, so it stays out of the initial chunk.
  sefaria: async (book, onProgress) => {
    const { loadBook } = await import('./sefaria');
    return loadBook(book, onProgress);
  },
};

export function loadBook(book: Book, onProgress?: Progress): Promise<BookDoc> {
  return LOADERS[book.provider](book, onProgress);
}

export type { LoadBook, Progress } from './types';
