import { FRANK_RUHL_WOFF2_BASE64 } from '../assets/fonts/frankRuhl';
import { esc } from './epub';
import { shouldIncludeToc, tocEntries } from './toc';
import type { Book, BookDoc } from './types';

const DICTA_SITE = 'https://library.dicta.org.il';

/**
 * Render the book into a print-ready window and open the browser's print
 * dialogue, where "Save as PDF" produces the file.
 *
 * We deliberately do not generate the PDF ourselves: jsPDF/pdfmake do not shape
 * right-to-left text, so a Hebrew PDF built that way needs a hand-rolled bidi
 * pass and an embedded font subset — a large amount of code that still gets
 * punctuation and mixed Hebrew/Latin runs wrong. The browser already has a
 * correct RTL text engine, so we use it.
 */
export function printDocument(book: Book, doc: BookDoc): void {
  const win = window.open('', '_blank');
  if (!win) throw new Error('הדפדפן חסם את חלון ההדפסה. יש לאפשר חלונות קופצים ולנסות שוב.');

  const entries = tocEntries(doc);
  const contents = shouldIncludeToc(entries)
    ? `<h2>תוכן העניינים</h2>
<ol class="contents">
${entries
  .map((e) => `<li><a href="#${e.id}">${esc(e.text)}</a> <span class="folio">${e.page}</span></li>`)
  .join('\n')}
</ol>
<div class="sep"></div>`
    : '';

  let headingIndex = -1;
  const body = doc.blocks
    .map((b) => {
      const inner = b.spans
        .map((sp) => (sp.bold ? `<strong>${esc(sp.text)}</strong>` : esc(sp.text)))
        .join(' ');
      if (b.kind !== 'heading') return `<p><span class="folio">[${b.page}]</span>${inner}</p>`;
      headingIndex++;
      return `<h2 id="${entries[headingIndex]?.id ?? ''}">${inner}</h2>`;
    })
    .join('\n');

  win.document.write(`<!doctype html>
<html lang="he" dir="rtl"><head><meta charset="utf-8"/>
<title>${esc(book.title)}</title>
<style>
@font-face {
  font-family: "Frank Ruhl Libre";
  font-weight: 400 700;
  src: url(data:font/woff2;base64,${FRANK_RUHL_WOFF2_BASE64}) format("woff2");
}
@page { size: A4; margin: 18mm 16mm; }
html { direction: rtl; }
body {
  direction: rtl;
  font-family: "Frank Ruhl Libre", "FrankRuehl", "David", serif;
  font-size: 12pt;
  line-height: 1.65;
  text-align: justify;
  margin: 0;
}
h1 { text-align: center; font-size: 20pt; margin: 0 0 4pt; }
h2 { text-align: center; font-size: 13pt; margin: 14pt 0 6pt; page-break-after: avoid; }
p { margin: 0 0 5pt; text-indent: 1.2em; orphans: 2; widows: 2; }
.folio { float: left; font-size: 8pt; color: #999; unicode-bidi: isolate; margin-inline-start: 6pt; }
.front { text-align: center; font-size: 10pt; color: #444; line-height: 1.7; }
.front a { color: #444; }
.sep { page-break-after: always; }
.contents { line-height: 1.9; font-size: 11pt; padding-inline-start: 1.5em; }
.contents a { color: inherit; text-decoration: none; }
.contents .folio { float: none; color: #999; font-size: 9pt; }
@media print { .hint { display: none; } }
.hint {
  background: #fffbe6; border: 1px solid #e6d98a; padding: 10px 14px;
  font-size: 10pt; text-align: center; margin-bottom: 16pt;
}
</style></head>
<body>
<div class="hint">בחלון ההדפסה שנפתח יש לבחור <strong>יעד: שמירה כ‑PDF</strong>.</div>
<h1>${esc(book.title)}</h1>
<div class="front">
${book.author ? `<div>${esc(book.author)}</div>` : ''}
${book.place && book.year ? `<div>${esc(book.place)} ${book.year}</div>` : ''}
<div>${esc(book.category)} · ${esc(book.subcategory)} · ${doc.pageCount} עמודים</div>
<div>הטקסט הופק בזיהוי אוטומטי (OCR) וייתכנו בו שיבושים. ללא ניקוד.</div>
<div>הטקסט באדיבות <a href="${DICTA_SITE}">הספרייה של דיקטה</a> · רישיון CC BY-SA 4.0</div>
</div>
<div class="sep"></div>
${contents}
${body}
</body></html>`);
  win.document.close();
  win.focus();
  // Let the embedded font load before the dialogue measures the page.
  const fonts = (win.document as Document & { fonts?: FontFaceSet }).fonts;
  const go = () => win.print();
  if (fonts?.ready) fonts.ready.then(go).catch(go);
  else win.setTimeout(go, 400);
}
