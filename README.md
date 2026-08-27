# הספרייה של דיקטה — ממשק הורדה

Browse the [Dicta Library](https://library.dicta.org.il) catalogue and download any of its
1,007 books as **EPUB**, **Word (.docx)**, or **PDF** — entirely in the browser, with no server.

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

The EPUB **embeds** Frank Ruhl Libre (Hebrew subset, ~19 kB, SIL OFL). Merely *naming* a
traditional face does not work: the CLM fonts are Linux-only and readers fall through to a generic
modern serif. DOCX asks for `FrankRuehl`, which ships with Windows, in the complex-script font
slot — the one Word actually uses for Hebrew.

### PDF

PDF is produced through the browser's own print dialogue ("Save as PDF") rather than generated.
jsPDF and pdfmake do not shape right-to-left text, so a hand-built Hebrew PDF needs a bespoke bidi
pass and an embedded font subset, and still mishandles mixed Hebrew/Latin runs. The browser
already has a correct RTL text engine.

Exports are **un-vocalised**; `nikudMetegFileURL` is deliberately ignored.

## Development

```bash
npm install        # .npmrc sets legacy-peer-deps (npm 10.9 trips over vitest's peer set)
npm run dev        # local dev server
npm test           # 52 tests: parser, EPUB/DOCX output, and the UI
npm run build      # production build into dist/
```

Helper scripts:

```bash
npm run fetch:books                    # re-pull and normalise the catalogue into public/
npm run embed:font                     # regenerate the base64 font module
npm run export:book alfeimenashe       # build one EPUB from the CLI, no browser
```

`scripts/fetch-books.mjs` normalises the upstream feed: `printYear` arrives as a number for 895
books and a string for 112, `authorEnglish` is sometimes null, and it precomputes a search key
with nikud and geresh/gershayim stripped so `אלפי מנשה עה"ת` is findable however you type it.

### Testing

`src/lib/render.test.ts` runs against a fixture of ten real OCR pages from אלפי מנשה: it asserts
no text is lost, opens the built EPUB and checks the zip layout, XML well-formedness, RTL
metadata, embedded font, TOC anchors and attribution. `src/App.test.tsx` covers search, faceted
filtering, sorting, URL state and the download flow.

## Deployment

Push to `main`; the Pages workflow tests, builds and deploys. `base` is relative, so it works
under any repository path. A second workflow refreshes the catalogue weekly.

## Licence

Texts © their authors, published by Dicta under CC BY-SA 4.0 — the same licence applies to the
files this tool generates, and each one carries the attribution. Frank Ruhl Libre is under the
SIL OFL 1.1 (`src/assets/fonts/OFL.txt`).
