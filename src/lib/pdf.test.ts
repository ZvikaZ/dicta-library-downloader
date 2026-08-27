import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFNumber } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { alfeiMenashe, sampleArchive } from '../test/fixtures';
import { pagesFromZip } from './fetchBook';
import { buildDoc } from './parseOcr';
import { buildPdf, visualString } from './pdf';
import { tocEntries } from './toc';

const doc = buildDoc(await pagesFromZip(sampleArchive()));

const fonts = {
  regular: new Uint8Array(readFileSync(resolve('src/assets/fonts/FrankRuhlLibre-Regular.ttf'))),
  bold: new Uint8Array(readFileSync(resolve('src/assets/fonts/FrankRuhlLibre-Bold.ttf'))),
};

const bytes = await buildPdf(alfeiMenashe, doc, fonts);
// Parsed once at module scope: `await` is not allowed inside describe().
const loaded = await PDFDocument.load(bytes);

describe('bidi reordering', () => {
  it('reverses a right-to-left line as a whole, words included', () => {
    // Words as well as letters must flip: the first logical word ends up
    // rightmost, i.e. last in the left-to-right display string.
    expect(visualString('ענין מהות האש')).toBe('שאה תוהמ ןינע');
  });

  it('keeps embedded Latin and digits running left to right', () => {
    // The Latin run and the number keep their own direction while the Hebrew
    // around them flips — this is the part hand-rolled reversal gets wrong.
    const out = visualString('ספר Alfei Menashe שנת 1880 בדפוס');
    expect(out).toContain('Alfei Menashe');
    expect(out).toContain('1880');
    // Hebrew around them is reversed.
    expect(out).toContain('רפס');
  });

  it('places the first logical word to the right of the last', () => {
    const display = visualString('ALEF אמצע BET');
    expect(display.indexOf('BET')).toBeLessThan(display.indexOf('ALEF'));
  });

  it('mirrors bracket pairs', () => {
    expect(visualString('(שלום)')).toBe('(םולש)');
  });

  it('leaves a pure Latin string untouched', () => {
    expect(visualString('Alfei Menashe')).toBe('Alfei Menashe');
  });
});

describe('PDF output', () => {
  // Assertions run against the parsed document, not the raw bytes: pdf-lib
  // writes object streams, so the structure is compressed and not greppable.
  it('is a valid PDF', () => {
    expect(new TextDecoder('latin1').decode(bytes.slice(0, 5))).toBe('%PDF-');
  });

  it('has a title page, contents pages and body pages', () => {
    expect(loaded.getPageCount()).toBeGreaterThan(3);
  });

  it('records the book metadata', () => {
    expect(loaded.getTitle()).toBe(alfeiMenashe.title);
    expect(loaded.getAuthor()).toBe(alfeiMenashe.author);
  });

  it('carries a real outline so readers show a navigation tree', () => {
    const outlines = loaded.catalog.lookup(PDFName.of('Outlines'), PDFDict);
    expect(outlines).toBeDefined();
    expect(outlines.lookup(PDFName.of('Count'), PDFNumber).asNumber()).toBe(
      tocEntries(doc).length,
    );
    expect(loaded.catalog.get(PDFName.of('PageMode'))).toBe(PDFName.of('UseOutlines'));
  });

  it('links contents entries to their destination pages', () => {
    // Contents pages sit directly after the title page.
    const annots = loaded.getPage(1).node.lookup(PDFName.of('Annots'), PDFArray);
    expect(annots.size()).toBeGreaterThan(0);
    const first = annots.lookup(0, PDFDict);
    expect(first.lookup(PDFName.of('Subtype'))).toBe(PDFName.of('Link'));
  });

  it('embeds the fonts rather than relying on the reader', () => {
    const fontNames = loaded.context
      .enumerateIndirectObjects()
      .flatMap(([, obj]) => (obj instanceof PDFDict ? [obj] : []))
      .filter((d) => d.get(PDFName.of('FontFile2')) !== undefined);
    expect(fontNames.length).toBeGreaterThan(0);
  });

  it('does not choke on a book with no headings', async () => {
    const bare = {
      pageCount: 1,
      fidelity: 'pages' as const,
      blocks: [{ kind: 'para' as const, page: 1, spans: [{ text: 'טקסט קצר', bold: false }] }],
    };
    const out = await buildPdf(alfeiMenashe, bare, fonts);
    expect(new TextDecoder('latin1').decode(out.slice(0, 5))).toBe('%PDF-');
  });
});
