export interface Book {
  id: string;
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
  textUrl: string;
  ocrUrl: string;
  key: string;
}

export interface Facet {
  name: string;
  count: number;
}

export interface Facets {
  categories: Facet[];
  subcategories: Facet[];
  yearRange: [number, number];
  total: number;
  fetchedAt: string;
}

export interface Catalogue {
  facets: Facets;
  books: Book[];
}

export type BlockKind = 'heading' | 'para';

/** A run of words sharing one style. Bold is the only emphasis the OCR marks. */
export interface Span {
  text: string;
  bold: boolean;
}

export interface Block {
  kind: BlockKind;
  spans: Span[];
  /** Folio/page number this block starts on, as printed in the source file name. */
  page: number;
}

/** How much structural markup the source actually carried. */
export type Fidelity = 'heading' | 'bold' | 'pages';

export interface BookDoc {
  blocks: Block[];
  pageCount: number;
  fidelity: Fidelity;
}

export type ExportFormat = 'epub' | 'docx' | 'pdf';
