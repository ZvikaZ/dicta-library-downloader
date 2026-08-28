import fontkit from '@pdf-lib/fontkit';
import bidiFactory from 'bidi-js';
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

const bidi = bidiFactory();

// NOTE ON DIRECTION — read before changing anything here.
//
// @pdf-lib/fontkit reverses any run containing RTL characters. That is not the
// Unicode Bidi Algorithm: it flips digits, Latin and brackets too, so
// "וילנה 1880" comes out as "0881 הנליו". Pure Hebrew happens to survive.
//
// So we do the real algorithm with bidi-js, but only far enough to split a line
// into directional runs and order them left to right. Each run is then handed
// to pdf-lib in LOGICAL order:
//   - an RTL run is reversed by fontkit, which is exactly what we want, and
//     lands in the file in visual order — the same convention Word uses, which
//     is what makes copy and search work in Foxit and Acrobat;
//   - an LTR run has no RTL characters, so fontkit leaves it alone.
// Never pre-reverse a whole line and hand that over: fontkit reverses it again,
// the page still looks right, and search silently breaks.

interface Run {
  /** Logical-order text of this run, with bidi mirroring already applied. */
  text: string;
  spaces: number;
  /** True when this run reads right to left. */
  rtl: boolean;
}

// Characters that must be drawn as their mirror image inside a right-to-left
// run (Unicode rule L4). bidi-js exposes a map for this but returns it empty,
// so the pairs are listed here — the set that actually occurs in these texts.
const MIRRORED = new Map(
  Object.entries({
    '(': ')',
    ')': '(',
    '[': ']',
    ']': '[',
    '{': '}',
    '}': '{',
    '<': '>',
    '>': '<',
    '«': '»',
    '»': '«',
    '‹': '›',
    '›': '‹',
  }),
);

/**
 * The words of a line in display order, each word still in logical order.
 *
 * Word-level placement is what makes justification possible: PDF's `Tw`
 * operator only widens single-byte code 32, so it does nothing for the
 * two-byte Identity-H encoding these embedded fonts use. Word does the same
 * thing — one show-text operation per run of words.
 */
export function displayWords(logical: string): { text: string }[] {
  const cells: { text: string }[] = [];
  for (const run of directionalRuns(logical)) {
    const words = run.text.split(' ').filter(Boolean);
    if (run.rtl) words.reverse();
    for (const text of words) cells.push({ text });
  }
  return cells;
}

/** Split a line into directional runs, ordered left to right for display. */
export function directionalRuns(logical: string): Run[] {
  if (!logical) return [];

  const levels = bidi.getEmbeddingLevels(logical, 'rtl');
  const order = bidi.getReorderedIndices(logical, levels);
  // Odd embedding levels run right to left, and only there is a bracket drawn
  // as its mirror.
  const charAt = (i: number) =>
    levels.levels[i] % 2 === 1 ? (MIRRORED.get(logical[i]) ?? logical[i]) : logical[i];

  const runs: Run[] = [];
  let start = 0;
  const flush = (end: number) => {
    if (end <= start) return;
    const indices = order.slice(start, end);
    // Within a run the source indices ascend (LTR) or descend (RTL); either
    // way the logical text is the sorted range.
    const lo = Math.min(...indices);
    const hi = Math.max(...indices);
    let text = '';
    for (let i = lo; i <= hi; i++) text += charAt(i);
    runs.push({
      text,
      spaces: (text.match(/ /g) ?? []).length,
      rtl: levels.levels[lo] % 2 === 1,
    });
  };

  for (let k = 1; k <= order.length; k++) {
    const prev = levels.levels[order[k - 1]];
    const curr = k < order.length ? levels.levels[order[k]] : -1;
    // A run ends when the direction changes, or when the indices stop being
    // contiguous in the direction this run is running.
    const contiguous = k < order.length && Math.abs(order[k] - order[k - 1]) === 1;
    if (prev !== curr || !contiguous) {
      flush(k);
      start = k;
    }
  }

  return runs;
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

    const words = displayWords(logical);
    if (words.length === 0) return;

    const widths = words.map((w) => this.width(w.text, bold, size));
    const inkWidth = widths.reduce((a, b) => a + b, 0);
    const spaceW = this.width(' ', bold, size);
    const gaps = words.length - 1;
    const natural = inkWidth + gaps * spaceW;
    const boxWidth = CONTENT_W - opts.indent;

    // Justify by widening the gaps, never by stretching the glyphs. A gap that
    // would more than double is left alone: a short last-of-paragraph line
    // stretched across the page looks worse than a ragged one.
    let gap = spaceW;
    let x: number;
    if (opts.justify && gaps > 0 && natural < boxWidth) {
      const wanted = (boxWidth - inkWidth) / gaps;
      if (wanted <= spaceW * 3) {
        gap = wanted;
        x = MARGIN_X;
      } else {
        x = PAGE_W - MARGIN_X - opts.indent - natural;
      }
    } else if (opts.centre) {
      x = MARGIN_X + (CONTENT_W - natural) / 2;
    } else {
      // Right-aligned: the line hugs the right margin, as Hebrew must.
      x = PAGE_W - MARGIN_X - opts.indent - natural;
    }

    words.forEach((word, i) => {
      this.page.chunks.push({ text: word.text, x, y: this.y, bold, size });
      x += widths[i] + gap;
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
  const words = displayWords(text);
  const spaceW = opts.font.widthOfTextAtSize(' ', opts.size);
  const widths = words.map((w) => opts.font.widthOfTextAtSize(w.text, opts.size));
  const width = widths.reduce((a, b) => a + b, 0) + (words.length - 1) * spaceW;

  let x =
    opts.align === 'right'
      ? PAGE_W - MARGIN_X - width
      : opts.align === 'left'
        ? (opts.left ?? MARGIN_X)
        : MARGIN_X + (CONTENT_W - width) / 2;

  words.forEach((word, i) => {
    page.drawText(word.text, {
      x,
      y: opts.y,
      size: opts.size,
      font: opts.font,
      color: opts.colour ?? INK,
    });
    x += widths[i] + spaceW;
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
      if (c.wordSpacing) {
        page.pushOperators(
          PDFOperator.of(PDFOperatorNames.SetWordSpacing, [PDFNumber.of(c.wordSpacing)]),
        );
      }
      page.drawText(c.text, {
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
