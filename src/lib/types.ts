import type { Provider } from './providers/registry';

export type { Provider };

export interface Book {
  /** Globally unique across providers, e.g. `dicta:alfeimenashe`. */
  id: string;
  provider: Provider;
  /**
   * Where the provider's loader finds the text: a Dicta archive URL, or a
   * Sefaria ref. Opaque to everything except that provider.
   */
  ref: string;
  /** A page a reader can go to for the source text, where one exists. */
  sourceUrl: string | null;
  title: string;
  titleEn: string | null;
  author: string | null;
  authorEn: string | null;
  category: string;
  categoryEn: string;
  subcategory: string;
  subcategoryEn: string;
  place: string | null;
  placeEn: string | null;
  year: number | null;
  source: string;
  reviewed: boolean;
  key: string;
}

export interface Facet {
  name: string;
  count: number;
}

export interface Facets {
  categories: Facet[];
  subcategories: Facet[];
  /** Which library each book came from. Absent from a single-library file. */
  sources?: Facet[];
  total: number;
  fetchedAt: string;
}

export interface Catalogue {
  facets: Facets;
  books: Book[];
}

import type { Attribution } from './attribution';

export type BlockKind = 'heading' | 'para';

/** A run of words sharing one style. Bold is the only emphasis the OCR marks. */
export interface Span {
  text: string;
  bold: boolean;
}

export interface Block {
  kind: BlockKind;
  spans: Span[];
  /**
   * Citation slot: a Dicta scan folio, or an ordinal over Sefaria's sections.
   * Used for addressing — links, scroll restore, de-duplication — so it only
   * has to be stable and increasing, not meaningful.
   */
  page: number;
  /**
   * What gets printed for that slot: a folio number, or a Hebrew reference
   * like `ג׳:י״ב`. Defaults to the slot itself.
   */
  label?: string;
}

/** What a block's citation shows in the margin, contents and running head. */
export function blockLabel(block: Pick<Block, 'page' | 'label'>): string {
  return block.label ?? String(block.page);
}

/** How much structural markup the source actually carried. */
export type Fidelity = 'heading' | 'bold' | 'pages';

export interface BookDoc {
  blocks: Block[];
  pageCount: number;
  fidelity: Fidelity;
  /** Who to credit and under what licence — set by the provider that loaded it. */
  attribution: Attribution;
  /**
   * The word that introduces a citation in running text — `דף` for a scanned
   * folio. A Sefaria reference names its own units, so it has none.
   */
  citation?: string;
}

export type ExportFormat = 'epub' | 'docx' | 'pdf';
