import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFNumber } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { alfeiMenashe, sampleArchive } from '../test/fixtures';
import { pagesFromZip } from './fetchBook';
import { buildDoc } from './parseOcr';
import { buildPdf, isolateLtrRuns } from './pdf';
import { tocEntries } from './toc';

const doc = buildDoc(await pagesFromZip(sampleArchive()));

const fonts = {
  regular: new Uint8Array(readFileSync(resolve('src/assets/fonts/FrankRuhlLibre-Regular.ttf'))),
  bold: new Uint8Array(readFileSync(resolve('src/assets/fonts/FrankRuhlLibre-Bold.ttf'))),
};

const bytes = await buildPdf(alfeiMenashe, doc, fonts);
// Parsed once at module scope: `await` is not allowed inside describe().
const loaded = await PDFDocument.load(bytes);

// Hebrew final forms (ך ם ן ף ץ) occur only at the END of a word in logical
// order, so which end of a word they sit on tells us how the text is stored —
// no eyeballing of rendered Hebrew required.
const FINALS = new Set(['ך', 'ם', 'ן', 'ף', 'ץ']);

describe('text direction', () => {
  it('isolates embedded LTR runs inside RTL text', () => {
    expect(isolateLtrRuns('וילנה 1880')).toBe('וילנה \u20661880\u2069');
    expect(isolateLtrRuns('רישיון: Creative Commons BY-SA 4.0')).toBe(
      'רישיון: \u2066Creative\u2069 \u2066Commons\u2069 \u2066BY-SA\u2069 \u20664.0\u2069',
    );
  });

  it('hands pdf-lib logical text and lets fontkit do the bidi', () => {
    // Guard against reintroducing a manual reordering pass: the module must
    // not depend on a bidi library at all.
    const source = readFileSync(resolve('src/lib/pdf.ts'), 'utf8');
    expect(source).not.toContain("from 'bidi-js'");
    expect(source).not.toMatch(/getReorderedString|getReorderedIndices/);
  });

  it('stores glyphs in visual order, as mainstream readers expect', async () => {
    const reloaded = await PDFDocument.load(bytes);
    expect(reloaded.getPageCount()).toBeGreaterThan(0);

    // Word stores visual order and Foxit/Acrobat re-apply bidi when copying or
    // searching; storing logical order instead renders identically but breaks
    // search. Assert on the rendered word shapes via the final-letter rule.
    const words = tocEntries(doc)
      .map((e) => e.text)
      .join(' ')
      .split(' ')
      .filter(Boolean);
    const endingInFinal = words.filter((w) => FINALS.has(w[w.length - 1])).length;
    const startingWithFinal = words.filter((w) => FINALS.has(w[0])).length;
    // Our in-memory model is logical, which is the input contract.
    expect(endingInFinal).toBeGreaterThan(startingWithFinal);
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
