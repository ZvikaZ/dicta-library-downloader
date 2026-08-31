import { build } from 'esbuild';
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [k, ...rest] = arg.split('=');
    return [k, rest.join('=')];
  }),
);

const formats = (args.get('--formats') ?? 'epub,pdf')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const provider = args.get('--provider') ?? 'all';
const kind = args.get('--kind') ?? 'all';
const limit = Number.parseInt(args.get('--limit') ?? '0', 10);
const outDir = resolve(args.get('--out-dir') ?? 'public/opds/files');
const manifestPath = resolve(args.get('--manifest') ?? 'public/opds/exports.json');

if (formats.length === 0) throw new Error('No formats requested');
if (!formats.every((f) => ['epub', 'pdf', 'docx'].includes(f))) {
  throw new Error('Formats must be a comma list of epub,pdf,docx');
}

function parseIdList() {
  const set = new Set();
  const inline = args.get('--ids');
  if (inline) {
    inline
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((id) => set.add(id));
  }
  const file = args.get('--ids-file');
  return { set, file };
}

function outRef(bookId) {
  const [providerId, local] = String(bookId).split(':');
  const safeProvider = providerId.replace(/[^a-z0-9_-]/gi, '_');
  const safeLocal = (local ?? providerId).replace(/[^a-z0-9_-]/gi, '_');
  return join(safeProvider, safeLocal);
}

async function loadLib() {
  const entry = join(tmpdir(), `dicta-static-export-${Date.now()}.mjs`);
  await build({
    stdin: {
      contents: `export { buildEpub } from './src/lib/epub';
export { buildDocx } from './src/lib/docx';
export { buildPdf } from './src/lib/pdf';
export { loadBook } from './src/lib/providers';
export { downloadName } from './src/lib/filename';
export { mergeCatalogues } from './src/lib/catalogue';`,
      resolveDir: process.cwd(),
      sourcefile: 'static-export-entry.ts',
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

function mimeFor(format) {
  if (format === 'epub') return 'application/epub+zip';
  if (format === 'pdf') return 'application/pdf';
  return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
}

const { set: idSet, file: idsFile } = parseIdList();
if (idsFile) {
  const txt = await readFile(resolve(idsFile), 'utf8');
  txt
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    .forEach((id) => idSet.add(id));
}

const [dictaRaw, sefariaRaw] = await Promise.all([
  readFile('public/books.json', 'utf8'),
  readFile('public/books-sefaria.json', 'utf8'),
]);
const dicta = JSON.parse(dictaRaw);
const sefaria = JSON.parse(sefariaRaw);

const books = [...dicta.books, ...sefaria.books]
  .filter((b) => (provider === 'all' ? true : b.provider === provider))
  .filter((b) => (kind === 'all' ? true : b.kind === kind))
  .filter((b) => (idSet.size === 0 ? true : idSet.has(b.id) || idSet.has(b.id.replace(/^.*?:/, ''))));

if (Number.isFinite(limit) && limit > 0) books.length = Math.min(books.length, limit);
if (books.length === 0) throw new Error('No books matched filters');

await mkdir(outDir, { recursive: true });

const { buildEpub, buildPdf, buildDocx, loadBook, downloadName } = await loadLib();
const pdfFonts = {
  regular: new Uint8Array(await readFile('src/assets/fonts/FrankRuhlLibre-Regular.ttf')),
  bold: new Uint8Array(await readFile('src/assets/fonts/FrankRuhlLibre-Bold.ttf')),
};

const exported = [];
const skipped = [];
const failed = [];

for (let i = 0; i < books.length; i++) {
  const book = books[i];
  process.stdout.write(`[${i + 1}/${books.length}] ${book.id}… `);
  try {
    const doc = await loadBook(book);
    if (!doc.attribution.license.exportable) {
      skipped.push({ id: book.id, reason: `unexportable-license:${doc.attribution.license.name}` });
      process.stdout.write('skipped (license)\n');
      continue;
    }

    const base = outRef(book.id);
    const files = {};
    for (const format of formats) {
      const fileName = downloadName(book, format);
      const relPath = join(base, fileName);
      const absPath = join(outDir, relPath);
      await mkdir(dirname(absPath), { recursive: true });

      let bytes;
      if (format === 'epub') bytes = await buildEpub(book, doc);
      else if (format === 'pdf') bytes = await buildPdf(book, doc, pdfFonts);
      else bytes = await buildDocx(book, doc);

      await writeFile(absPath, bytes);
      files[format] = { path: relPath.replaceAll('\\\\', '/'), mime: mimeFor(format) };
    }

    exported.push({
      id: book.id,
      title: book.title,
      titleEn: book.titleEn,
      author: book.author,
      authorEn: book.authorEn,
      category: book.category,
      subcategory: book.subcategory,
      provider: book.provider,
      kind: book.kind,
      sourceUrl: book.sourceUrl,
      files,
    });
    process.stdout.write('ok\n');
  } catch (err) {
    failed.push({ id: book.id, error: err instanceof Error ? err.message : String(err) });
    process.stdout.write(`failed (${failed[failed.length - 1].error})\n`);
  }
}

const manifest = {
  generatedAt: new Date().toISOString(),
  outDir: outDir.replaceAll('\\\\', '/'),
  totalMatched: books.length,
  exported,
  skipped,
  failed,
};

await mkdir(dirname(manifestPath), { recursive: true });
await writeFile(manifestPath, JSON.stringify(manifest, null, 2));

console.log(
  `Done: exported ${exported.length}, skipped ${skipped.length}, failed ${failed.length}. Manifest: ${manifestPath}`,
);
if (failed.length) process.exitCode = 1;
