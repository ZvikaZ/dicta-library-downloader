import fontkit from '@pdf-lib/fontkit';
import bidiFactory from 'bidi-js';
import {
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFNumber,
  PDFRef,
  PDFString,
  rgb,
  type PDFFont,
  type PDFPage,
} from 'pdf-lib';
import { shouldIncludeToc, tocEntries, type TocEntry } from './toc';
import type { Book, BookDoc, Span } from './types';

const bidi = bidiFactory();

export interface PdfFonts {
  regular: Uint8Array;
  bold: Uint8Array;
}

// A4 in points.
const PAGE_W = 595.28;
const PAGE_H = 841.89;

const MARGIN_X = 62;
const MARGIN_TOP = 74;
const MARGIN_BOTTOM = 64;
const CONTENT_W = PAGE_W - MARGIN_X * 2;
const CONTENT_TOP = PAGE_H - MARGIN_TOP;

const BODY_SIZE = 11.5;
const BODY_LEADING = 18;
const HEAD_SIZE = 13.5;
const HEAD_SPACE_BEFORE = 15;
const HEAD_SPACE_AFTER = 7;
const PARA_INDENT = 16;
const PARA_SPACING = 3;

const INK = rgb(0.12, 0.1, 0.08);
const GREY = rgb(0.58, 0.55, 0.5);
const RULE = rgb(0.82, 0.79, 0.73);

/** One positioned, single-styled piece of text. */
interface Chunk {
  x: number;
  y: number;
  text: string;
  bold: boolean;
  size: number;
  grey?: boolean;
}

interface LaidPage {
  chunks: Chunk[];
  /** Printed folio numbers that begin on this page. */
  folios: number[];
}

/**
 * Display form of a string, via the library's own Unicode Bidi Algorithm.
 *
 * This is the ONLY place direction is handled. Hebrew needs no contextual
 * shaping (its letters do not join), so correct output is purely a matter of
 * reordering — and reordering is exactly what bidi-js does. Splitting the
 * result on spaces yields the words already in left-to-right display order,
 * each with its glyphs in display order, which is all the renderer needs.
 */
export function visualString(text: string): string {
  return bidi.getReorderedString(text, bidi.getEmbeddingLevels(text, 'rtl'));
}

function textOf(spans: Span[]): string {
  return spans
    .map((s) => s.text)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

class Layout {
  readonly pages: LaidPage[] = [];
  private page: LaidPage = { chunks: [], folios: [] };
  private y = CONTENT_TOP;
  private seenFolios = new Set<number>();

  private readonly regular: PDFFont;
  private readonly bold: PDFFont;

  constructor(regular: PDFFont, bold: PDFFont) {
    this.regular = regular;
    this.bold = bold;
    this.pages.push(this.page);
  }

  private font(bold: boolean): PDFFont {
    return bold ? this.bold : this.regular;
  }

  private width(text: string, bold: boolean, size: number): number {
    return this.font(bold).widthOfTextAtSize(text, size);
  }

  private newPage(): void {
    this.page = { chunks: [], folios: [] };
    this.pages.push(this.page);
    this.y = CONTENT_TOP;
  }

  private ensure(height: number): void {
    if (this.y - height < MARGIN_BOTTOM) this.newPage();
  }

  noteFolio(folio: number): void {
    if (this.seenFolios.has(folio)) return;
    this.seenFolios.add(folio);
    this.page.folios.push(folio);
  }

  /** Where the next block will land — used to record heading destinations. */
  get position(): { page: number; y: number } {
    return { page: this.pages.length - 1, y: this.y };
  }

  /**
   * Break a paragraph into lines and place them right-aligned, justifying all
   * but the last.
   *
   * Line breaking runs on the logical text; reversing a run never changes its
   * total advance width, so the measurements hold for the display form too.
   */
  paragraph(
    text: string,
    opts: { size: number; bold?: boolean; centre?: boolean; indent?: boolean },
  ): void {
    const { size } = opts;
    const bold = opts.bold === true;
    const leading = opts.centre ? size * 1.45 : BODY_LEADING;
    const spaceW = this.width(' ', bold, size);
    const firstIndent = opts.indent ? PARA_INDENT : 0;

    const lines: string[][] = [];
    let line: string[] = [];
    let lineWidth = 0;

    for (const word of text.split(' ')) {
      if (!word) continue;
      const wordW = this.width(word, bold, size);
      const avail = CONTENT_W - (lines.length === 0 ? firstIndent : 0);
      const next = line.length === 0 ? wordW : lineWidth + spaceW + wordW;
      if (line.length > 0 && next > avail) {
        lines.push(line);
        line = [word];
        lineWidth = wordW;
      } else {
        line.push(word);
        lineWidth = next;
      }
    }
    if (line.length) lines.push(line);

    lines.forEach((ws, i) => {
      this.ensure(leading);
      this.drawLine(ws.join(' '), {
        size,
        bold,
        justify: i < lines.length - 1 && !opts.centre && lines.length > 1,
        centre: opts.centre === true,
        indent: i === 0 ? firstIndent : 0,
      });
      this.y -= leading;
    });
  }

  private drawLine(
    logical: string,
    opts: { size: number; bold: boolean; justify: boolean; centre: boolean; indent: number },
  ): void {
    const { size, bold } = opts;

    // Reorder once, then simply lay the words out left to right.
    const pieces = visualString(logical).split(' ').filter(Boolean);
    if (pieces.length === 0) return;

    const widths = pieces.map((w) => this.width(w, bold, size));
    const spaceW = this.width(' ', bold, size);
    const natural = widths.reduce((a, b) => a + b, 0) + spaceW * (pieces.length - 1);

    const boxWidth = CONTENT_W - opts.indent;
    const gaps = pieces.length - 1;

    let gapW = spaceW;
    let x: number;
    if (opts.justify && gaps > 0 && natural < boxWidth) {
      gapW = spaceW + (boxWidth - natural) / gaps;
      x = MARGIN_X;
    } else if (opts.centre) {
      x = MARGIN_X + (CONTENT_W - natural) / 2;
    } else {
      x = PAGE_W - MARGIN_X - opts.indent - natural;
    }

    pieces.forEach((piece, i) => {
      this.page.chunks.push({ x, y: this.y, text: piece, bold, size });
      x += widths[i] + gapW;
    });
  }

  space(height: number): void {
    this.y -= height;
  }

  headingBreak(): void {
    // Never leave a heading stranded at the foot of a page.
    if (this.y - (HEAD_SPACE_BEFORE + HEAD_SIZE * 1.45 + BODY_LEADING * 2) < MARGIN_BOTTOM) {
      this.newPage();
    }
  }
}

function layoutBody(
  doc: BookDoc,
  regular: PDFFont,
  bold: PDFFont,
): { pages: LaidPage[]; targets: Map<string, { page: number; y: number }> } {
  const engine = new Layout(regular, bold);
  const targets = new Map<string, { page: number; y: number }>();
  const entries = tocEntries(doc);
  const entryByIndex = new Map<number, TocEntry>();
  let e = 0;
  doc.blocks.forEach((b, i) => {
    if (b.kind === 'heading' && entries[e] && entries[e].id === `h${i}`) {
      entryByIndex.set(i, entries[e]);
      e++;
    }
  });

  doc.blocks.forEach((block, i) => {
    engine.noteFolio(block.page);
    if (block.kind === 'heading') {
      engine.headingBreak();
      engine.space(HEAD_SPACE_BEFORE);
      const entry = entryByIndex.get(i);
      if (entry) targets.set(entry.id, engine.position);
      engine.paragraph(textOf(block.spans), { size: HEAD_SIZE, centre: true, bold: true });
      engine.space(HEAD_SPACE_AFTER);
    } else {
      engine.paragraph(textOf(block.spans), { size: BODY_SIZE, indent: true });
      engine.space(PARA_SPACING);
    }
  });

  return { pages: engine.pages, targets };
}

/** Draw a single-styled RTL line straight onto a page (title page, headers). */
function drawRtl(
  page: PDFPage,
  text: string,
  opts: {
    y: number;
    size: number;
    font: PDFFont;
    align?: 'centre' | 'right';
    colour?: ReturnType<typeof rgb>;
  },
): void {
  const display = visualString(text);
  const width = opts.font.widthOfTextAtSize(display, opts.size);
  const x =
    opts.align === 'right' ? PAGE_W - MARGIN_X - width : MARGIN_X + (CONTENT_W - width) / 2;
  page.drawText(display, {
    x,
    y: opts.y,
    size: opts.size,
    font: opts.font,
    color: opts.colour ?? INK,
  });
}

export async function buildPdf(book: Book, doc: BookDoc, fonts: PdfFonts): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);

  // Subsetting keeps only the glyphs actually used — without it each file
  // would carry ~260 kB of unused Hebrew and Latin outlines.
  const regular = await pdf.embedFont(fonts.regular, { subset: true });
  const bold = await pdf.embedFont(fonts.bold, { subset: true });

  pdf.setTitle(book.title);
  if (book.author) pdf.setAuthor(book.author);
  pdf.setSubject(`${book.category} · ${book.subcategory}`);
  pdf.setProducer('Dicta Library Downloader');
  pdf.setCreator('https://library.dicta.org.il');

  const entries = tocEntries(doc);
  const withToc = shouldIncludeToc(entries);
  const body = layoutBody(doc, regular, bold);

  // ---- title page ----
  const title = pdf.addPage([PAGE_W, PAGE_H]);
  let ty = PAGE_H - 210;
  drawRtl(title, book.title, { y: ty, size: 26, font: bold });
  ty -= 34;
  if (book.author) {
    drawRtl(title, book.author, { y: ty, size: 13, font: regular });
    ty -= 22;
  }
  if (book.place && book.year) {
    drawRtl(title, `${book.place} ${book.year}`, { y: ty, size: 11, font: regular, colour: GREY });
    ty -= 20;
  }

  title.drawLine({
    start: { x: MARGIN_X + 120, y: ty - 16 },
    end: { x: PAGE_W - MARGIN_X - 120, y: ty - 16 },
    thickness: 0.6,
    color: RULE,
  });

  let fy = 150;
  const footLines = [
    `${book.category} · ${book.subcategory} · ${doc.pageCount} עמודים`,
    'הטקסט הופק בסריקה ובזיהוי אוטומטי (OCR) וייתכנו בו שיבושים. ללא ניקוד.',
    'הטקסט באדיבות הספרייה של דיקטה — library.dicta.org.il',
    'המרכז הישראלי לניתוח טקסטים. תודה על המיזם ועל שחרור הטקסטים לשימוש חופשי.',
    'רישיון: Creative Commons BY-SA 4.0',
  ];
  for (const line of footLines) {
    drawRtl(title, line, { y: fy, size: 9, font: regular, colour: GREY });
    fy -= 15;
  }

  // ---- contents ----
  // Entry count is known up front, so the contents length — and therefore the
  // page numbers printed in it — can be resolved in a single pass.
  const TOC_LEADING = 17;
  const tocCapacity = Math.floor((CONTENT_TOP - MARGIN_BOTTOM - 40) / TOC_LEADING);
  const tocPageCount = withToc ? Math.max(1, Math.ceil(entries.length / tocCapacity)) : 0;
  const firstBodyPage = 1 + tocPageCount; // zero-based index of the first body page

  const tocPages: PDFPage[] = [];
  for (let i = 0; i < tocPageCount; i++) tocPages.push(pdf.addPage([PAGE_W, PAGE_H]));

  // ---- body ----
  const bodyPages = body.pages.map(() => pdf.addPage([PAGE_W, PAGE_H]));
  body.pages.forEach((laid, index) => {
    const page = bodyPages[index];
    for (const c of laid.chunks) {
      page.drawText(c.text, {
        x: c.x,
        y: c.y,
        size: c.size,
        font: c.bold ? bold : regular,
        color: c.grey ? GREY : INK,
      });
    }

    // Running head and folio, so a passage can be cited from the printout.
    drawRtl(page, book.title, {
      y: PAGE_H - 52,
      size: 8.5,
      font: regular,
      colour: GREY,
      align: 'centre',
    });
    page.drawLine({
      start: { x: MARGIN_X, y: PAGE_H - 60 },
      end: { x: PAGE_W - MARGIN_X, y: PAGE_H - 60 },
      thickness: 0.5,
      color: RULE,
    });
    const folio = laid.folios.length
      ? `דף ${laid.folios[0]}${laid.folios.length > 1 ? `–${laid.folios[laid.folios.length - 1]}` : ''}`
      : '';
    if (folio) {
      drawRtl(page, folio, { y: PAGE_H - 52, size: 8.5, font: regular, colour: GREY, align: 'right' });
    }
    const number = String(firstBodyPage + index + 1);
    page.drawText(number, {
      x: PAGE_W / 2 - regular.widthOfTextAtSize(number, 9) / 2,
      y: 38,
      size: 9,
      font: regular,
      color: GREY,
    });
  });

  // ---- fill in the contents, now that page numbers are known ----
  if (withToc) {
    entries.forEach((entry, i) => {
      const page = tocPages[Math.floor(i / tocCapacity)];
      const row = i % tocCapacity;
      const y = CONTENT_TOP - 40 - row * TOC_LEADING;

      const target = body.targets.get(entry.id);
      const pageNumber = target ? firstBodyPage + target.page + 1 : 0;

      const label = visualString(entry.text);
      const labelWidth = regular.widthOfTextAtSize(label, 10.5);
      page.drawText(label, {
        x: PAGE_W - MARGIN_X - labelWidth,
        y,
        size: 10.5,
        font: regular,
        color: INK,
      });

      const num = String(pageNumber);
      const numWidth = regular.widthOfTextAtSize(num, 9.5);
      page.drawText(num, { x: MARGIN_X, y, size: 9.5, font: regular, color: GREY });

      // Leader dots between the title and the page number.
      const dotStart = MARGIN_X + numWidth + 6;
      const dotEnd = PAGE_W - MARGIN_X - labelWidth - 6;
      if (dotEnd > dotStart) {
        page.drawLine({
          start: { x: dotStart, y: y + 2.5 },
          end: { x: dotEnd, y: y + 2.5 },
          thickness: 0.4,
          color: RULE,
          dashArray: [0.6, 2.6],
        });
      }

      if (target) {
        addLink(pdf, page, {
          rect: [MARGIN_X, y - 3, PAGE_W - MARGIN_X, y + 12],
          target: bodyPages[target.page].ref,
          top: target.y + 24,
        });
      }
    });

    tocPages.forEach((page, i) => {
      drawRtl(page, 'תוכן העניינים', { y: CONTENT_TOP, size: 15, font: bold });
      const number = String(i + 2);
      page.drawText(number, {
        x: PAGE_W / 2 - regular.widthOfTextAtSize(number, 9) / 2,
        y: 38,
        size: 9,
        font: regular,
        color: GREY,
      });
    });
  }

  addOutline(
    pdf,
    entries
      .map((e) => {
        const target = body.targets.get(e.id);
        return target
          ? { title: e.text, ref: bodyPages[target.page].ref, top: target.y + 24 }
          : null;
      })
      .filter((x): x is { title: string; ref: PDFRef; top: number } => x !== null),
  );

  return pdf.save();
}

/** Clickable region jumping to a position on another page. */
function addLink(
  pdf: PDFDocument,
  page: PDFPage,
  opts: { rect: [number, number, number, number]; target: PDFRef; top: number },
): void {
  const annot = pdf.context.obj({
    Type: 'Annot',
    Subtype: 'Link',
    Rect: opts.rect,
    Border: [0, 0, 0],
    A: {
      S: 'GoTo',
      D: [opts.target, PDFName.of('XYZ'), PDFNumber.of(0), PDFNumber.of(opts.top), PDFNumber.of(0)],
    },
  });
  const existing = page.node.get(PDFName.of('Annots'));
  const annots = existing ? existing : pdf.context.obj([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (annots as any).push(pdf.context.register(annot));
  page.node.set(PDFName.of('Annots'), annots);
}

/**
 * A real PDF outline, so the reader's sidebar shows the book's sections.
 * pdf-lib has no outline API, so the dictionary tree is written by hand.
 */
function addOutline(
  pdf: PDFDocument,
  items: { title: string; ref: PDFRef; top: number }[],
): void {
  if (items.length === 0) return;

  const outlinesRef = pdf.context.nextRef();
  const refs = items.map(() => pdf.context.nextRef());

  items.forEach((item, i) => {
    const dict = pdf.context.obj({
      Title: PDFHexString.fromText(item.title),
      Parent: outlinesRef,
      Dest: [item.ref, PDFName.of('XYZ'), PDFNumber.of(0), PDFNumber.of(item.top), PDFNumber.of(0)],
      ...(i > 0 ? { Prev: refs[i - 1] } : {}),
      ...(i < items.length - 1 ? { Next: refs[i + 1] } : {}),
    });
    pdf.context.assign(refs[i], dict);
  });

  pdf.context.assign(
    outlinesRef,
    pdf.context.obj({
      Type: 'Outlines',
      First: refs[0],
      Last: refs[refs.length - 1],
      Count: items.length,
    }),
  );

  pdf.catalog.set(PDFName.of('Outlines'), outlinesRef);
  pdf.catalog.set(PDFName.of('PageMode'), PDFName.of('UseOutlines'));
  // Keep a sane viewer default.
  pdf.catalog.set(PDFName.of('Lang'), PDFString.of('he'));
}
