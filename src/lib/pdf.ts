import fontkit from '@pdf-lib/fontkit';
import {
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFNumber,
  PDFOperator,
  PDFOperatorNames,
  PDFRef,
  PDFString,
  rgb,
  type PDFFont,
  type PDFPage,
} from 'pdf-lib';
import { shouldIncludeToc, tocEntries, type TocEntry } from './toc';
import type { Book, BookDoc, Span } from './types';

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
const LRI = '\u2066';
const PDI = '\u2069';
const LTR_RUN = /[A-Za-z0-9][A-Za-z0-9./:@+_%#&='’‘"“”\-]*/g;

/**
 * One laid-out line, holding its text in logical order.
 *
 * See the note on direction below for why it is not pre-reordered.
 */
interface Chunk {
  text: string;
  x: number;
  y: number;
  bold: boolean;
  size: number;
  grey?: boolean;
  /** Extra width added to each space, for justification (PDF `Tw`). */
  wordSpacing?: number;
}

interface LaidPage {
  chunks: Chunk[];
  /**
   * Where each scanned folio starts on this page. Rendered as a small number
   * in the outer margin, so a passage can be traced back to the scan without
   * the folio interfering with the PDF's own page numbering.
   */
  folios: { folio: number; y: number }[];
}

// NOTE ON DIRECTION — read before "fixing" anything here.
//
// Text is passed to pdf-lib in LOGICAL order and nothing reorders it first.
// @pdf-lib/fontkit runs the Unicode Bidi Algorithm inside its own layout step,
// so it emits the glyphs in visual order and stores them that way — which is
// exactly what Word does, and what Foxit, Acrobat and the rest expect when they
// re-apply bidi for copy and search.
//
// Reordering the string ourselves first (with bidi-js, say) reverses it twice:
// the page still looks right, but the stored text comes out logical and search
// silently breaks in mainstream readers. That bug cost a lot of time; do not
// reintroduce it.

function textOf(spans: Span[]): string {
  return spans
    .map((s) => s.text)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Keep embedded Latin/number runs stable inside RTL lines.
 *
 * pdf-lib/fontkit does bidi reordering itself, but mixed runs still need an
 * explicit directional isolate or readers may flip the run's internal order.
 */
export function isolateLtrRuns(text: string): string {
  return text.replace(LTR_RUN, (run) => `${LRI}${run}${PDI}`);
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
    this.page.folios.push({ folio, y: this.y });
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
    if (!logical.trim()) return;

    const width = this.width(logical, bold, size);
    const boxWidth = CONTENT_W - opts.indent;
    const gaps = (logical.match(/ /g) ?? []).length;

    let x: number;
    let wordSpacing = 0;
    if (opts.justify && gaps > 0 && width < boxWidth) {
      // Tw widens every space in the run, so justification needs no extra
      // draw calls and the glyph advances stay natural — as Word's do.
      wordSpacing = (boxWidth - width) / gaps;
      x = MARGIN_X;
    } else if (opts.centre) {
      x = MARGIN_X + (CONTENT_W - width) / 2;
    } else {
      x = PAGE_W - MARGIN_X - opts.indent - width;
    }

    this.page.chunks.push({ text: logical, x, y: this.y, bold, size, wordSpacing });
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

/** Draw one single-style line, right-aligned or centred, in display order. */
function drawLine(
  page: PDFPage,
  text: string,
  opts: {
    y: number;
    size: number;
    font: PDFFont;
    align?: 'centre' | 'right' | 'left';
    left?: number;
    colour?: ReturnType<typeof rgb>;
  },
): void {
  if (!text.trim()) return;
  const display = isolateLtrRuns(text);
  const width = opts.font.widthOfTextAtSize(text, opts.size);
  const x =
    opts.align === 'right'
      ? PAGE_W - MARGIN_X - width
      : opts.align === 'left'
        ? (opts.left ?? MARGIN_X)
        : MARGIN_X + (CONTENT_W - width) / 2;

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
  const line = (
    page: PDFPage,
    text: string,
    o: {
      y: number;
      size: number;
      bold?: boolean;
      align?: 'centre' | 'right' | 'left';
      left?: number;
      colour?: ReturnType<typeof rgb>;
    },
  ) =>
    drawLine(page, text, {
      y: o.y,
      size: o.size,
      font: o.bold ? bold : regular,
      align: o.align,
      left: o.left,
      colour: o.colour,
    });
  let ty = PAGE_H - 210;
  line(title, book.title, { y: ty, size: 26, bold: true });
  ty -= 34;
  if (book.author) {
    line(title, book.author, { y: ty, size: 13 });
    ty -= 22;
  }
  if (book.place && book.year) {
    line(title, `${book.place} ${book.year}`, { y: ty, size: 11, colour: GREY });
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
  for (const footLine of footLines) {
    line(title, footLine, { y: fy, size: 9, colour: GREY });
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
      const display = isolateLtrRuns(c.text);
      if (c.wordSpacing) {
        page.pushOperators(
          PDFOperator.of(PDFOperatorNames.SetWordSpacing, [PDFNumber.of(c.wordSpacing)]),
        );
      }
      page.drawText(display, {
        x: c.x,
        y: c.y,
        size: c.size,
        font: c.bold ? bold : regular,
        color: c.grey ? GREY : INK,
      });
      // Word spacing is text state, so it persists until cleared.
      if (c.wordSpacing) {
        page.pushOperators(PDFOperator.of(PDFOperatorNames.SetWordSpacing, [PDFNumber.of(0)]));
      }
    }

    // Running head and folio, so a passage can be cited from the printout.
    line(page, book.title, { y: PAGE_H - 52, size: 8.5, colour: GREY });
    page.drawLine({
      start: { x: MARGIN_X, y: PAGE_H - 60 },
      end: { x: PAGE_W - MARGIN_X, y: PAGE_H - 60 },
      thickness: 0.5,
      color: RULE,
    });
    // Scan folios sit in the outer margin beside the line they begin on. The
    // running head stays clean and the page's own number is the only number a
    // reader has to track.
    for (const mark of laid.folios) {
      const label = String(mark.folio);
      const width = regular.widthOfTextAtSize(label, 7.5);
      page.drawText(label, {
        x: MARGIN_X - 14 - width,
        y: Math.min(Math.max(mark.y, MARGIN_BOTTOM), CONTENT_TOP),
        size: 7.5,
        font: regular,
        color: GREY,
      });
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

      const labelWidth = regular.widthOfTextAtSize(entry.text, 10.5);
      line(page, entry.text, { y, size: 10.5, align: 'right' });

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
      line(page, 'תוכן העניינים', {
        y: CONTENT_TOP,
        size: 15,
        bold: true,
      });
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
