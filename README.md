# מדף — ממשק קריאה והורדה

Read and search **2,098 Hebrew books** and **5,416 commentaries** from two libraries — the
[Dicta Library](https://library.dicta.org.il) and [Sefaria](https://www.sefaria.org) — and
download any of them as **EPUB**, **Word (.docx)**, or **PDF**, generated entirely in the browser
with no server. A commentary opens as a book with the text it comments on woven into it. Each file gets a table of contents, citable references, and proper
right-to-left Hebrew typesetting.

> All texts are the work of their libraries. **[Dicta — the Israel Center for Text
> Analysis](https://library.dicta.org.il)** scans, OCRs and releases rabbinic works under
> [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/); **[Sefaria](https://www.sefaria.org)**
> maintains a free digital library of Jewish texts, where each edition carries its own licence.
> Thank you both for the projects and for releasing the texts freely. This site is an unofficial
> interface and is affiliated with neither.

## Why this exists

Neither library hands you a finished book. Dicta publishes each work as a **ZIP of one text file
per scanned page**; Sefaria serves **nested JSON over an API**. There is no EPUB, DOCX or PDF in
either dataset. This app builds those formats client-side, and works as a static site because
both `files.dicta.org.il` and `www.sefaria.org/api` serve `Access-Control-Allow-Origin: *`.

Everything downstream of loading a book — the reader, the search, the three exporters, the
bidi handling — is source-agnostic. Adding a library means three things: an entry in
`src/lib/providers/registry.ts`, a loader module beside it that turns the library's data into a
`BookDoc`, and a script that writes its catalogue into `public/`. Nothing else counts the
libraries, and the `Provider` type widens from the registry on its own.

### One vocabulary for two shelves

The libraries classify differently, and each is internally consistent: Dicta catalogues printed
volumes by genre *and by what they comment on* (`תלמוד ומפרשיו`, `רמב"ם ומפרשיו`), Sefaria
catalogues primary texts by canonical corpus (`תלמוד`, `משנה`, `תוספתא`). Merged raw that gave 24
categories with near-duplicate pairs — `הלכה` beside `הלכה ומנהג`, `שו"ת` beside
`שאלות ותשובות (שו"ת)` — where picking one silently hid half the shelf.

`src/lib/categories.ts` maps both onto **15 subjects**, ten of which now draw on both libraries.
Where a library's category is too coarse the subcategory decides: Dicta files prayer books under
`שונות`, and Sefaria files the Mishneh Torah's 90 sections under `הלכה`, away from the
commentators Dicta gives a shelf of their own.

The mapping is applied when the catalogues are **merged**, not when they are fetched — each
library's own file keeps its own vocabulary, which is its data to describe as it likes. An
unmapped category passes through unchanged rather than falling into a catch-all, so a library that
adds one shows up in the sidebar instead of going quietly missing.

## How a Dicta book is converted

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

## How a Sefaria book is converted

Sefaria stores a book as a **jagged array**: nested arrays of HTML fragments, one nesting level
per address in a reference. Depth varies — `Genesis` is `[chapter][verse]`, `Rashi on Berakhot` is
`[daf][line][comment]` — so `sefariaDoc.ts` recurses on the array rather than assuming a shape,
emitting a heading per outermost section and a paragraph per segment.

A **simple** book arrives whole in one request, under a second even for a 4.6 MB Shulchan Arukh.
A **complex** one (the Haggadah, the Zohar) rejects a book-level ref: there the schema tree is
fetched instead, walked to its `JaggedArrayNode` leaves, and each leaf pulled separately — the
node's own Hebrew title becomes the heading, which is better structure than anything derivable
from the text.

Sections are numbered in Hebrew letters (`טו`, never `יה`), and a Talmud daf as `ה ע"א`. Where
Dicta prints a scan folio in the margin, Sefaria prints the reference: `ג:יב`.

Inline markup is reduced to the one thing the block model carries, bold, under a rule worth
stating: **a span boundary only ever falls where the source had whitespace.** Everything
downstream rejoins spans with a single space, so splitting `<big>בְּ</big>רֵאשִׁית` at the tag
would render `בְּ רֵאשִׁית`. Where emphasis changes mid-word the word wins.

### A commentary is a book, with the text it comments on inside it

Sefaria's 5,416 מפרשים are catalogued too, and open as books in their own right —
מלבי"ם על שיר השירים is a book, not a setting on שיר השירים. Opening one fetches the
commentary *and* the work it comments on, and weaves them: the verse, then the
comments on it, the way a printed commentary volume sets the page.

The join needs nothing new. A commentary's structure is its base text's plus one
level, so where a verse is `ח:ד` its comments are `ח:ד:א`, `ח:ד:ב` — the citation
label already built for the margin *is* the join key, and a comment belongs under
the block whose label is its own with the last address dropped. Sefaria's
`base_text_mapping` is not consulted; it is absent on 2,269 of them anyway. A
comment on a verse the base edition lacks is appended rather than dropped.

Commentaries outnumber books three to one and are mostly per-tractate repeats,
so browse defaults to ספרים and a **סוג** facet opts into פירושים. They are always
searchable. None of them cost a per-title request: `heCommentator`,
`base_text_titles` and `heTitle` are all in the bulk index already.

### Attribution is per-edition

Dicta releases its whole library under one licence, so its credit is a constant. A Sefaria *work*
has no licence — its *editions* do, and the same book can be public domain in one and under
copyright in another. So the loader reads `license`, `versionTitle` and `versionSource` from the
version it actually fetched, carries them on the `BookDoc`, and every colophon is rendered from
that. An edition naming a rights holder (`Copyright: Schocken`) can be read here but its download
is refused.

A woven commentary draws on two sources at once, often on different terms — the Malbim is
נחלת הכלל, the Song of Songs beneath it is CC BY-SA. Both are credited, and the **stricter**
licence governs the file: one restricted part makes the whole export refuse.

### Cantillation

Frank Ruhl Libre has every Hebrew vowel, meteg included, and **not one** of the 31 te'amim. A
glyph the font lacks is a box, so a verse of Tanakh reached the PDF as `לְרֵ □יחַ □שְׁמָנֶ □יךָ`.
The exports strip the accents (and three other marks the font also lacks), which keeps the text
fully vocalised and loses only the chant — the trade a printed commentary volume usually makes.
The reader keeps them: a browser falls back to a system font per missing glyph.

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

**Copy and search work.** A PDF show-text operation always advances left to right, which appears
to force a choice: visual order (correct on screen, reversed when copied) or logical order
(readable when copied, mirrored on screen). A `TJ` array escapes it — between glyphs you may insert
a numeric offset that moves the pen anywhere, including backwards. So glyphs are listed in *reading*
order while landing right-to-left on the page. Selecting, copying and Ctrl-F all yield real Hebrew;
98.6% of the words extracted from a generated book match the source text verbatim.

**Vocalisation.** Dicta exports are un-vocalised — `nikudMetegFileURL` is deliberately ignored.
Sefaria's texts often *are* vocalised, Tanakh with cantillation on top, and they are kept that way.
That was expected to be a problem: `pdf.ts` places words at explicit coordinates and pdf-lib does no
OpenType shaping, so combining marks have no GPOS attachment to position them. Rendering a
vocalised page and inspecting it settled the question — the marks land correctly, so no stripping
is needed.

## Development

```bash
npm install        # .npmrc sets legacy-peer-deps (npm 10.9 trips over vitest's peer set)
npm run dev        # local dev server
npm test           # 184 tests: both parsers, EPUB/DOCX/PDF output, bidi, licensing, UI
npm run build      # production build into dist/
```

Helper scripts:

```bash
npm run fetch:books                    # re-pull and normalise the Dicta catalogue into public/
npm run fetch:sefaria                  # same for Sefaria (~1,100 API calls, a few minutes)
npm run embed:font                     # regenerate the base64 font module
npm run export:book alfeimenashe       # build EPUB + PDF from the CLI, no browser
python scripts/make-pdf-fonts.py       # regenerate the static TTFs the PDF embeds
```

`scripts/fetch-books.mjs` normalises the upstream feed: `printYear` arrives as a number for 895
books and a string for 112, `authorEnglish` is sometimes null, and it precomputes a search key
with nikud and geresh/gershayim stripped so `אלפי מנשה עה"ת` is findable however you type it.

`scripts/fetch-sefaria.mjs` keeps the **1,091 standalone works** out of Sefaria's 6,604 titles —
the rest are per-tractate commentaries (`Rashi on Berakhot`) and targumim, which are not books in
the sense this catalogue means. Author, year and place live only on the per-title endpoint, so it
makes one request per book at concurrency 8. A few titles ship no `heCategories`; rather than
hardcode a table, the corpus translates itself from every other book's category pair.

Both catalogues refresh daily in CI. Because each run stamps `fetchedAt` with today's date, the
file always differs — so the workflow compares the **books** rather than the file, and commits
only when one actually changed.

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

Texts © their authors. Dicta's are published under CC BY-SA 4.0 — the same licence applies to the
files this tool generates from them. Sefaria's are licensed per edition, and every export carries
the licence of the edition it was built from. Frank Ruhl Libre is under the SIL OFL 1.1
(`src/assets/fonts/OFL.txt`).
