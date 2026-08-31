import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [k, ...rest] = arg.split('=');
    return [k, rest.join('=')];
  }),
);

const manifestPath = resolve(args.get('--manifest') ?? 'public/opds/exports.json');
const outputDir = resolve(args.get('--out-dir') ?? 'public/opds');
const baseUrl = (args.get('--base-url') ?? './files/').replace(/\/+$/, '/') ;
const pageSize = Math.max(1, Number.parseInt(args.get('--page-size') ?? '200', 10) || 200);

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function slug(input) {
  const raw = String(input ?? '').trim();
  const latin = raw
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9_-]/g, '');
  return latin || `cat-${Buffer.from(raw || 'x').toString('hex').slice(0, 12)}`;
}

function feedXml({ title, id, links = [], entries = [] }) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<feed xmlns="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/terms/">\n` +
    `  <id>${esc(id)}</id>\n` +
    `  <title>${esc(title)}</title>\n` +
    `  <updated>${new Date().toISOString()}</updated>\n` +
    links.map((link) => `  <link ${Object.entries(link).map(([k, v]) => `${k}="${esc(v)}"`).join(' ')} />`).join('\n') +
    (links.length ? '\n' : '') +
    entries.join('\n') +
    `\n</feed>\n`;
}

function entryXml(item) {
  const author = item.author || item.authorEn || 'לא ידוע';
  const links = Object.entries(item.files)
    .map(([format, f]) => {
      const title = format.toUpperCase();
      const href = `${baseUrl}${String(f.path).replace(/^\/+/, '')}`;
      return `    <link rel="http://opds-spec.org/acquisition/open-access" type="${esc(f.mime)}" href="${esc(href)}" title="${esc(title)}" />`;
    })
    .join('\n');

  const source = item.sourceUrl
    ? `\n    <link rel="alternate" type="text/html" href="${esc(item.sourceUrl)}" title="Source" />`
    : '';

  return (
    `  <entry>\n` +
    `    <id>${esc(`tag:madaf,2026:${item.id}`)}</id>\n` +
    `    <title>${esc(item.title)}</title>\n` +
    `    <updated>${new Date().toISOString()}</updated>\n` +
    `    <author><name>${esc(author)}</name></author>\n` +
    `    <category term="${esc(item.category)}" label="${esc(item.category)}" />\n` +
    `    <category term="${esc(item.subcategory)}" label="${esc(item.subcategory)}" />\n` +
    `    <dc:type>${esc(item.kind)}</dc:type>\n` +
    `    <dc:publisher>${esc(item.provider)}</dc:publisher>\n` +
    links +
    source +
    `\n  </entry>`
  );
}

async function loadLib() {
  const entry = join(tmpdir(), `dicta-opds-${Date.now()}.mjs`);
  await build({
    stdin: {
      contents: `export { mergeCatalogues } from './src/lib/catalogue';`,
      resolveDir: process.cwd(),
      sourcefile: 'opds-entry.ts',
      loader: 'ts',
    },
    bundle: true,
    format: 'esm',
    platform: 'node',
    outfile: entry,
    logLevel: 'error',
  });
  const mod = await import(pathToFileURL(entry).href);
  await rm(entry, { force: true });
  return mod;
}

const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const [dictaRaw, sefariaRaw] = await Promise.all([
  readFile('public/books.json', 'utf8'),
  readFile('public/books-sefaria.json', 'utf8'),
]);
const { mergeCatalogues } = await loadLib();
const merged = mergeCatalogues([JSON.parse(dictaRaw), JSON.parse(sefariaRaw)]);
const byId = new Map(merged.books.map((b) => [b.id, b]));

const exported = (manifest.exported ?? [])
  .map((item) => {
    const fromCatalogue = byId.get(item.id);
    return fromCatalogue ? { ...item, category: fromCatalogue.category, subcategory: fromCatalogue.subcategory } : item;
  })
  .filter((item) => item.files && Object.keys(item.files).length > 0)
  .sort((a, b) => String(a.title).localeCompare(String(b.title), 'he'));

if (exported.length === 0) throw new Error('Manifest has no exported files');

await mkdir(outputDir, { recursive: true });

const allEntries = exported.map(entryXml);
const allPages = [];
for (let i = 0; i < allEntries.length; i += pageSize) {
  allPages.push(allEntries.slice(i, i + pageSize));
}

for (let i = 0; i < allPages.length; i++) {
  const name = i === 0 ? 'all.xml' : `all-${i + 1}.xml`;
  const next = i + 1 < allPages.length ? (i + 1 === 1 ? 'all-2.xml' : `all-${i + 2}.xml`) : null;
  const prev = i > 0 ? (i === 1 ? 'all.xml' : `all-${i}.xml`) : null;

  const links = [
    { rel: 'self', href: name, type: 'application/atom+xml;profile=opds-catalog;kind=acquisition' },
    { rel: 'start', href: 'index.xml', type: 'application/atom+xml;profile=opds-catalog;kind=navigation' },
  ];
  if (next) links.push({ rel: 'next', href: next, type: 'application/atom+xml;profile=opds-catalog;kind=acquisition' });
  if (prev) links.push({ rel: 'previous', href: prev, type: 'application/atom+xml;profile=opds-catalog;kind=acquisition' });

  await writeFile(
    join(outputDir, name),
    feedXml({ title: `מדף — כל הספרים (${i + 1}/${allPages.length})`, id: `tag:madaf,2026:all:${i + 1}`, links, entries: allPages[i] }),
  );
}

const byCategory = new Map();
for (const item of exported) {
  const key = String(item.category || 'ללא קטגוריה');
  const list = byCategory.get(key);
  if (list) list.push(item);
  else byCategory.set(key, [item]);
}

const categoryLinks = [];
for (const [category, items] of [...byCategory.entries()].sort((a, b) => a[0].localeCompare(b[0], 'he'))) {
  const file = `category-${slug(category)}.xml`;
  const entries = items.map(entryXml);
  await writeFile(
    join(outputDir, file),
    feedXml({
      title: `מדף — ${category}`,
      id: `tag:madaf,2026:category:${slug(category)}`,
      links: [
        { rel: 'self', href: file, type: 'application/atom+xml;profile=opds-catalog;kind=acquisition' },
        { rel: 'start', href: 'index.xml', type: 'application/atom+xml;profile=opds-catalog;kind=navigation' },
      ],
      entries,
    }),
  );

  categoryLinks.push(
    `  <entry>\n` +
      `    <title>${esc(category)} (${items.length})</title>\n` +
      `    <id>${esc(`tag:madaf,2026:nav:${file}`)}</id>\n` +
      `    <updated>${new Date().toISOString()}</updated>\n` +
      `    <content type="text">קטלוג לפי קטגוריה</content>\n` +
      `    <link rel="subsection" href="${esc(file)}" type="application/atom+xml;profile=opds-catalog;kind=acquisition" />\n` +
      `  </entry>`,
  );
}

const navigationEntries = [
  `  <entry>\n` +
    `    <title>כל הספרים (${exported.length})</title>\n` +
    `    <id>tag:madaf,2026:nav:all</id>\n` +
    `    <updated>${new Date().toISOString()}</updated>\n` +
    `    <content type="text">עיון בכל הספרים המיוצאים</content>\n` +
    `    <link rel="subsection" href="all.xml" type="application/atom+xml;profile=opds-catalog;kind=acquisition" />\n` +
    `  </entry>`,
  ...categoryLinks,
];

await writeFile(
  join(outputDir, 'index.xml'),
  feedXml({
    title: 'מדף — קטלוג OPDS ל-KOReader',
    id: 'tag:madaf,2026:index',
    links: [{ rel: 'self', href: 'index.xml', type: 'application/atom+xml;profile=opds-catalog;kind=navigation' }],
    entries: navigationEntries,
  }),
);

console.log(`Wrote OPDS catalog in ${outputDir}: index.xml, ${allPages.length} all-feed page(s), ${byCategory.size} category feeds`);
