import type { ExportFormat } from './types';

/**
 * Kept free of any heavy imports: the detail panel needs these labels on first
 * paint, while the EPUB/DOCX builders behind them are loaded on demand.
 */
export const FORMAT_LABEL: Record<ExportFormat, string> = {
  epub: 'EPUB',
  docx: 'Word',
  pdf: 'PDF',
};

export const FORMAT_HINT: Record<ExportFormat, string> = {
  epub: 'לקוראי ספרים דיגיטליים',
  docx: 'לעריכה בוורד',
  pdf: 'להדפסה ולקריאה, עם תוכן עניינים וסימניות',
};
