import { buildDocx } from './docx';
import { buildEpub } from './epub';
import { loadBook, type Progress } from './fetchBook';
import { printDocument } from './printView';
import type { Book, BookDoc, ExportFormat } from './types';

export function saveBytes(bytes: Uint8Array, fileName: string, mime: string): void {
  const blob = new Blob([bytes as unknown as BlobPart], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.append(a);
  a.click();
  a.remove();
  // Revoking immediately can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Cache parsed books so switching format does not re-download the archive. */
const cache = new Map<string, BookDoc>();

export async function getDoc(book: Book, onProgress?: Progress): Promise<BookDoc> {
  const hit = cache.get(book.id);
  if (hit) return hit;
  const doc = await loadBook(book, onProgress);
  cache.set(book.id, doc);
  return doc;
}

export async function exportBook(
  book: Book,
  format: ExportFormat,
  onProgress?: Progress,
): Promise<void> {
  const doc = await getDoc(book, onProgress);

  if (format === 'print') {
    printDocument(book, doc);
    return;
  }
  if (format === 'epub') {
    saveBytes(await buildEpub(book, doc), `${book.id}.epub`, 'application/epub+zip');
    return;
  }
  saveBytes(
    await buildDocx(book, doc),
    `${book.id}.docx`,
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  );
}
