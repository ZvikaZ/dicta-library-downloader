import JSZip from 'jszip';
import { buildDoc } from '../parseOcr';
import type { BookDoc } from '../types';
import type { LoadBook, Progress } from './types';

export interface Page {
  name: string;
  html: string;
}

/** Unpack a Dicta OCR archive into ordered pages. */
export async function pagesFromZip(data: ArrayBuffer | Uint8Array): Promise<Page[]> {
  const zip = await JSZip.loadAsync(data);
  const entries = Object.values(zip.files).filter((f) => !f.dir && /\.html?$/i.test(f.name));
  // Names are zero-padded, so a plain sort is the printed page order.
  entries.sort((a, b) => a.name.localeCompare(b.name, 'en'));
  return Promise.all(
    entries.map(async (f) => ({ name: f.name, html: await f.async('string') })),
  );
}

/**
 * Dicta publishes each book as one ZIP of per-page OCR HTML, so the whole book
 * arrives in a single request and the progress bar can follow the bytes.
 */
export const loadBook: LoadBook = async (book, onProgress): Promise<BookDoc> => {
  const res = await fetch(book.ref);
  if (!res.ok) throw new Error(`הורדת הספר נכשלה (${res.status})`);

  const total = Number(res.headers.get('content-length')) || 0;
  let data: Uint8Array;

  if (res.body && total > 0 && onProgress) {
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let received = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.length;
      onProgress('download', Math.min(1, received / total));
    }
    data = new Uint8Array(received);
    let at = 0;
    for (const c of chunks) {
      data.set(c, at);
      at += c.length;
    }
  } else {
    data = new Uint8Array(await res.arrayBuffer());
  }

  onProgress?.('parse', 1);
  const pages = await pagesFromZip(data);
  if (pages.length === 0) throw new Error('הארכיון ריק');

  onProgress?.('build', 1);
  return buildDoc(pages);
};

export type { Progress };
