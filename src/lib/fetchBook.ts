/**
 * Kept as the app's entry point for loading a book; the per-library logic lives
 * in ./providers. `pagesFromZip` is re-exported for the CLI export script.
 */
export { loadBook } from './providers';
export { pagesFromZip, type Page } from './providers/dicta';
export type { Progress } from './providers/types';
