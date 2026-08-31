# To explore

## A period facet spanning both libraries

**Status:** explored, measured, parked. No code in the tree.

Once the catalogue carries both Dicta and Sefaria, the existing year filter
stops working, because the two feeds mean different things by "year":

| | field | meaning | range |
| --- | --- | --- | --- |
| Dicta | `printYear` | year this **printing** was produced | 1733–1982 |
| Sefaria | `compDate`, else `pubDate` | year the work was **composed** | −1400–2023 |

A single numeric range over both is meaningless — Genesis arrives as −1400, and
a Rishonim work reprinted in 1850 arrives as 1850.

### What was tried

Bucketing both into the conventional periods — מקרא, תנאים, אמוראים, גאונים,
ראשונים, אחרונים, מודרני — and replacing the slider with a period filter.

Sefaria carries a curated `era` on `/api/v2/index/{title}`, with codes
`T` / `A` / `GN` / `RI` / `AH` / `CO`. Measured over the 1,091 standalone works:

- `era` alone covers **768/1091 (70%)**
- `era`, falling back to bucketing the year, covers **959/1091 (88%)**
- where both are known they agree on **91%**, and every disagreement is between
  adjacent periods — so the fallback is sound

Boundaries that worked: `< 0` מקרא · `< 220` תנאים · `< 500` אמוראים ·
`< 1039` גאונים · `< 1500` ראשונים · `< 1900` אחרונים · else מודרני. The מקרא
bucket is needed; without it Genesis falls into תנאים.

### Why it is parked

Dicta only knows the print year, which says nothing about when a work was
written. Bucketing it anyway put all 1,007 Dicta books into אחרונים and מודרני,
which is noise. Leaving Dicta without an era instead makes the period filter a
Sefaria-only filter in disguise: picking any period silently excludes the whole
Dicta half of the catalogue.

Neither behaviour is good enough to ship, so there is currently **no period
facet and no `era` field** in either catalogue.

### If picking this up again

The open question is not how to derive the period — that part is solved and the
numbers above are reliable. It is what a date filter should do when one of two
libraries has no usable date at all. Worth considering:

- Show the period filter only when Sefaria is the selected source, alongside a
  source facet.
- Find composition dates for Dicta books elsewhere. Around 32 of them match a
  Sefaria title exactly on the Hebrew name, and Sefaria's author records carry
  dates — but that covers 3% of the Dicta catalogue, so it is not a route to a
  filter that works across both.
- Drop date filtering from the merged view entirely and keep it per-source.

Derivation and coverage figures measured 31 August 2026 against
`www.sefaria.org/api`.
