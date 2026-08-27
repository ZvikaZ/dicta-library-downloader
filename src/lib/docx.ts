import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
  PageBreak,
} from 'docx';
import { shouldIncludeToc, tocEntries } from './toc';
import type { Book, BookDoc, Span } from './types';

const CC_BY_SA = 'https://creativecommons.org/licenses/by-sa/4.0/';

// Word picks the font for Hebrew from the *complex script* slot (`cs`), not
// `ascii`, so both are set — otherwise the run silently falls back to Calibri.
// FrankRuehl ships with Windows, which is where these files will mostly open.
const FONT = { ascii: 'FrankRuehl', hAnsi: 'FrankRuehl', cs: 'FrankRuehl' } as const;

// Every paragraph needs `bidirectional`, otherwise Word lays the text out
// left-to-right and strands the punctuation on the wrong side of the line.
function rtl(
  content: string | Span[],
  opts: { heading?: boolean; small?: boolean } = {},
): Paragraph {
  const spans: Span[] = typeof content === 'string' ? [{ text: content, bold: false }] : content;
  const size = opts.small ? 18 : 24; // half-points

  return new Paragraph({
    bidirectional: true,
    alignment: opts.heading ? AlignmentType.CENTER : AlignmentType.JUSTIFIED,
    heading: opts.heading ? HeadingLevel.HEADING_2 : undefined,
    spacing: opts.heading ? { before: 320, after: 160 } : { after: 120 },
    children: spans.map(
      (s, i) =>
        new TextRun({
          // Runs were split on style, so restore the separating space.
          text: i === 0 ? s.text : ' ' + s.text,
          rightToLeft: true,
          font: FONT,
          size,
          bold: opts.heading || s.bold,
        }),
    ),
  });
}

export async function buildDocx(book: Book, doc: BookDoc): Promise<Uint8Array> {
  const front: Paragraph[] = [
    new Paragraph({
      bidirectional: true,
      alignment: AlignmentType.CENTER,
      heading: HeadingLevel.TITLE,
      spacing: { after: 240 },
      children: [
        new TextRun({ text: book.title, rightToLeft: true, font: FONT, size: 40, bold: true }),
      ],
    }),
  ];
  if (book.author) front.push(rtl(book.author, { heading: true }));
  if (book.place && book.year) front.push(rtl(`${book.place} ${book.year}`, { small: true }));
  front.push(
    rtl(`${book.category} · ${book.subcategory} · ${doc.pageCount} עמודים`, { small: true }),
    rtl('הטקסט הופק בסריקה ובזיהוי אוטומטי (OCR) וייתכנו בו שיבושים. ללא ניקוד.', { small: true }),
    rtl(
      'הטקסט באדיבות הספרייה של דיקטה (library.dicta.org.il) — המרכז הישראלי לניתוח טקסטים, ' +
        'המנגיש טקסטים תורניים לציבור ללא עלות. תודה על העבודה ועל השחרור לשימוש חופשי.',
      { small: true },
    ),
    rtl(`רישיון: Creative Commons BY-SA 4.0 — ${CC_BY_SA}`, { small: true }),
    new Paragraph({ children: [new PageBreak()] }),
  );

  // Word has no reader-supplied navigation, so the contents page is written
  // into the document. Folio numbers are the printed ones from the scan, which
  // stay meaningful regardless of how Word repaginates.
  const entries = tocEntries(doc);
  const contents: Paragraph[] = [];
  if (shouldIncludeToc(entries)) {
    contents.push(rtl('תוכן העניינים', { heading: true }));
    for (const e of entries) {
      contents.push(
        new Paragraph({
          bidirectional: true,
          alignment: AlignmentType.START,
          spacing: { after: 60 },
          children: [
            new TextRun({ text: e.text, rightToLeft: true, font: FONT, size: 22 }),
            new TextRun({ text: `  ${e.page}`, rightToLeft: true, font: FONT, size: 18 }),
          ],
        }),
      );
    }
    contents.push(new Paragraph({ children: [new PageBreak()] }));
  }

  const body = doc.blocks.map((b) => rtl(b.spans, { heading: b.kind === 'heading' }));

  const document = new Document({
    creator: book.author ?? 'Dicta',
    title: book.title,
    description: `${book.category} · ${book.subcategory}`,
    // `bidirectional` is not a document-level style property; every paragraph
    // sets it individually in `rtl()` above.
    styles: { default: { document: { run: { font: FONT, size: 24 } } } },
    sections: [{ properties: {}, children: [...front, ...contents, ...body] }],
  });

  // Neither Packer.toBuffer (needs Node's Buffer, which Vite does not polyfill)
  // nor Packer.toBlob (needs a complete Blob implementation) works everywhere.
  // Base64 depends on nothing but atob, so one path serves browser and tests.
  const base64 = await Packer.toBase64String(document);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
