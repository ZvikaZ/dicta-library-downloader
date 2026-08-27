# הספרייה של דיקטה — ממשק הורדה

Browse the [Dicta Library](https://library.dicta.org.il) catalogue and download any of its
1,007 books as **EPUB**, **Word (.docx)**, or **PDF** — generated entirely in the browser, with no
server. Each file gets a table of contents, the printed folio numbers, and proper right-to-left
Hebrew typesetting.

> All texts are the work of **[Dicta — the Israel Center for Text Analysis](https://library.dicta.org.il)**,
> which scans, OCRs and releases these rabbinic works to the public free of charge under
> [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). Thank you for the project and
> for releasing the texts freely. This site is an unofficial download interface and is not
> affiliated with Dicta. Catalogue data:
> [Dicta-Library-Download](https://github.com/Dicta-Israel-Center-for-Text-Analysis/Dicta-Library-Download).

## Why this exists

Dicta publishes each book as a **ZIP of one text file per scanned page** — there is no EPUB,
DOCX or PDF anywhere in the dataset. This app builds those formats client-side. It works as a
static site because `files.dicta.org.il` serves `Access-Control-Allow-Origin: *`, so the browser
can fetch and unpack the archives directly.

## How a book is converted

Each book offers three archives. We use `OCRDataURL` (per-page HTML), not the plain-text one:
it is the only source carrying any structure. Each word is a `<span>` whose `class` may be
`heading`, `bold`, `marked-paragraph`, `flagged` (low OCR confidence) or `edited`. There is no
stylesheet, so the file *looks* like flat text in a browser — the structure is in the attributes.

Structural markup is optional across this corpus, so the parser degrades in tiers:

| Tier | Condition | Result |
| --- | --- | --- |
| `heading` | book marks headings explicitly | real headings and TOC |
| `bold` | only `bold` / `marked-paragraph` | headings inferred (see below) |
| `pages` | no structural markup at all | one block per scanned page |

**Inferring headings from bold.** Rabbinic typesetting bolds the opening word of ordinary
paragraphs, so "bold ⇒ heading" produces mostly false positives. The reliable signal is the
*right-hand* delimiter: a short bold run immediately followed by a paragraph break is a section
title, including the common run-in case where the title closes the previous paragraph rather than
opening its own. Bold that is not a title is kept as `<strong>`, matching how Dicta renders it.

Every output carries the printed folio numbers from the scan, so a passage stays citable against
the original edition.

### Typography

All three formats use **Frank Ruhl Libre** (Rafael Frank's 1908 face, the type most
20th-century Torah printing used), and all three **embed** it. Merely *naming* a traditional face
does not work: the CLM fonts are Linux-only, so readers fall through to a generic modern serif.

Google Fonts ships Frank Ruhl Libre only as a variable font, and pdf-lib embeds raw bytes without
instantiating a weight axis — so `scripts/make-pdf-fonts.py` pins wght=400 and wght=700 into static
TTFs (committed; re-run only when upstream changes). The EPUB embeds the woff2 subset. DOCX asks
for `FrankRuehl`, which ships with Windows, in the **complex-script** font slot — the one Word
actually consults for Hebrew; setting only the ascii slot silently yields Calibri.

### PDF

The PDF is generated directly with pdf-lib — not through the browser's print dialogue — with a
generated contents page, a real PDF outline (the reader's sidebar navigation), internal links from
each contents entry to its page, running heads carrying the printed folio, and justified type.

Hebrew needs **no contextual shaping** (unlike Arabic, its letters do not join), so correct output
is purely a matter of reordering, and `bidi-js` does that. One rule keeps this honest: direction is
handled in exactly one function, `visualString`, which calls the library and nothing else. An
earlier hand-rolled version — manual index swaps and a "sort back" pass — produced confidently
wrong output, so **do not reimplement the reordering.**

One known limitation: PDF has no notion of direction, and a single show-text operation always
paints left to right, so the content stream is inherently in display order. Text copied out of the
PDF therefore comes out visually ordered rather than logically ordered. Display is correct;
copy-paste and in-file search are not. The EPUB and DOCX have no such limitation.

Exports are **un-vocalised**; `nikudMetegFileURL` is deliberately ignored.

## Development

```bash
npm install        # .npmrc sets legacy-peer-deps (npm 10.9 trips over vitest's peer set)
npm run dev        # local dev server
npm test           # 64 tests: parser, EPUB/DOCX/PDF output, bidi, and the UI
npm run build      # production build into dist/
```

Helper scripts:

```bash
npm run fetch:books                    # re-pull and normalise the catalogue into public/
npm run embed:font                     # regenerate the base64 font module
npm run export:book alfeimenashe       # build EPUB + PDF from the CLI, no browser
python scripts/make-pdf-fonts.py       # regenerate the static TTFs the PDF embeds
```

`scripts/fetch-books.mjs` normalises the upstream feed: `printYear` arrives as a number for 895
books and a string for 112, `authorEnglish` is sometimes null, and it precomputes a search key
with nikud and geresh/gershayim stripped so `אלפי מנשה עה"ת` is findable however you type it.

### Testing

`src/lib/render.test.ts` runs against a fixture of ten real OCR pages from אלפי מנשה: it asserts
no text is lost, opens the built EPUB and checks the zip layout, XML well-formedness, RTL
metadata, embedded font, TOC anchors and attribution. `src/lib/pdf.test.ts` re-parses the generated
PDF to check the outline, links and embedded fonts, and pins the bidi behaviour — including that
embedded Latin and digits keep their own direction. `src/App.test.tsx` covers search, faceted
filtering, sorting, URL state and the download flow.

Verifying RTL output is genuinely tricky: PyMuPDF applies bidi at every extraction level, so it
reports logical text for a correctly-drawn page and cannot be used to judge layout. The reliable
check is a rendered image containing Latin markers, whose left/right position is unambiguous.

## Deployment

Push to `main`; the Pages workflow tests, builds and deploys. `base` is relative, so it works
under any repository path. A second workflow refreshes the catalogue weekly.

## Licence

Texts © their authors, published by Dicta under CC BY-SA 4.0 — the same licence applies to the
files this tool generates, and each one carries the attribution. Frank Ruhl Libre is under the
SIL OFL 1.1 (`src/assets/fonts/OFL.txt`).
