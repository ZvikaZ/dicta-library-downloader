declare module 'bidi-js' {
  export interface EmbeddingLevels {
    levels: Uint8Array;
    paragraphs: { start: number; end: number; level: number }[];
  }
  export interface Bidi {
    getEmbeddingLevels(text: string, baseDirection?: 'ltr' | 'rtl' | 'auto'): EmbeddingLevels;
    getReorderedIndices(text: string, embeddingLevels: EmbeddingLevels): number[];
    getReorderedString(text: string, embeddingLevels: EmbeddingLevels): string;
    getMirroredCharactersMap(text: string, embeddingLevels: EmbeddingLevels): Map<number, string>;
  }
  export default function bidiFactory(): Bidi;
}
