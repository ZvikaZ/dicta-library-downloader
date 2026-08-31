// Pulls the upstream Dicta catalogue, normalises it, and vendors it into public/.
// Run: npm run fetch:books
import { writeFile, mkdir } from 'node:fs/promises';

const SOURCE =
  'https://raw.githubusercontent.com/Dicta-Israel-Center-for-Text-Analysis/Dicta-Library-Download/main/books.json';

// Hebrew points/accents plus the geresh/gershayim variants that break naive matching.
const NIKUD = /[\u0591-\u05C7]/g;
const MARKS = /[\u05F3\u05F4"'`\u2018\u2019\u201C\u201D]/g;

export function normalise(value) {
  return (value ?? '')
    .replace(NIKUD, '')
    .replace(MARKS, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

// printYear arrives as int for most books and string for ~110 of them.
function toYear(raw) {
  const n = Number.parseInt(String(raw ?? ''), 10);
  return Number.isFinite(n) ? n : null;
}

const res = await fetch(SOURCE);
if (!res.ok) throw new Error(`Upstream returned ${res.status}`);
const raw = await res.json();

const books = raw.map((b) => ({
  // Prefixed so ids stay unique once a second library is in the catalogue.
  id: `dicta:${b.fileName}`,
  provider: 'dicta',
  // Dicta's commentaries are scans of printed volumes with no alignment data,
  // so they are read as books in their own right, not woven into a base text.
  kind: 'book',
  title: b.displayName,
  titleEn: b.displayNameEnglish ?? null,
  author: b.author?.trim() || null,
  authorEn: b.authorEnglish?.trim() || null,
  category: b.category,
  categoryEn: b.categoryEnglish,
  subcategory: b.subcategory,
  subcategoryEn: b.subcategoryEnglish,
  place: b.printLocation || null,
  placeEn: b.printLocationEnglish || null,
  year: toYear(b.printYear),
  source: b.source,
  reviewed: b.notHumanReviewed !== true,
  // The OCR archive, not the plain-text one: it is the only source carrying
  // structure. nikudMetegFileURL is deliberately dropped — exports are
  // un-vocalised.
  ref: b.OCRDataURL,
  sourceUrl: b.textFileURL,
  key: normalise(
    [b.displayName, b.displayNameEnglish, b.author, b.authorEnglish, b.printLocation].join(' '),
  ),
}));

const byCount = (a, b) => b[1] - a[1];
const tally = (fn) => {
  const m = new Map();
  for (const b of books) {
    const k = fn(b);
    if (k) m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m.entries()].sort(byCount).map(([name, count]) => ({ name, count }));
};

const years = books.map((b) => b.year).filter((y) => y !== null);
const facets = {
  categories: tally((b) => b.category),
  subcategories: tally((b) => b.subcategory),
  yearRange: [Math.min(...years), Math.max(...years)],
  total: books.length,
  fetchedAt: new Date().toISOString().slice(0, 10),
};

await mkdir('public', { recursive: true });
await writeFile('public/books.json', JSON.stringify({ facets, books }));
console.log(
  `Wrote ${books.length} books · ${facets.categories.length} categories · ` +
    `${facets.subcategories.length} subcategories · years ${facets.yearRange.join('–')} · ` +
    `${books.filter((b) => !b.reviewed).length} unreviewed`,
);
