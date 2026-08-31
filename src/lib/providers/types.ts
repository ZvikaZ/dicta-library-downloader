import type { Book, BookDoc } from '../types';

export type Progress = (stage: 'download' | 'parse' | 'build', ratio: number) => void;

/**
 * Turn a catalogue entry into a parsed book. Each library publishes its texts
 * differently — Dicta as one ZIP of OCR pages, Sefaria as JSON over an API —
 * so this is the only thing the rest of the app needs them to agree on.
 */
export type LoadBook = (book: Book, onProgress?: Progress) => Promise<BookDoc>;
