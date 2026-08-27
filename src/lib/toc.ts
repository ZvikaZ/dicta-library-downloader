import { blockText } from './parseOcr';
import type { BookDoc } from './types';

/** Single source of truth for anchor ids, shared by the TOC and the renderers. */
export function headingId(blockIndex: number): string {
  return `h${blockIndex}`;
}

export interface TocEntry {
  text: string;
  /** Printed folio the section opens on. */
  page: number;
  /** Anchor id, unique across the book. */
  id: string;
}

/**
 * A visible table of contents, derived from the detected headings.
 *
 * The reader's own navigation covers EPUB, but DOCX and print have no such
 * affordance, so the contents page is generated into the document itself.
 * Folio numbers come from the scan, which makes them citable against the
 * printed edition rather than against our pagination.
 */
export function tocEntries(doc: BookDoc): TocEntry[] {
  const entries: TocEntry[] = [];
  doc.blocks.forEach((b, i) => {
    if (b.kind !== 'heading') return;
    const text = blockText(b).trim();
    if (text) entries.push({ text, page: b.page, id: headingId(i) });
  });
  return entries;
}

/** Below this a contents page is noise rather than navigation. */
const MIN_ENTRIES = 3;

export function shouldIncludeToc(entries: TocEntry[]): boolean {
  return entries.length >= MIN_ENTRIES;
}
