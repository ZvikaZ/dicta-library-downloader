// Build an EPUB for one book straight from the Dicta archive, using the same
// library code the web app runs.
//   node scripts/export-book.mjs alfeimenashe [outDir]
import { build } from 'esbuild';
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const [, , bookId = 'alfeimenashe', outDir = 'dist-books'] = process.argv;

/** Bundle the TS library so Node can import it without a loader. */
export async function loadLib() {
  const entry = join(tmpdir(), `dicta-lib-${Date.now()}.mjs`);
  await build({
    stdin: {
      contents: `export { buildDoc } from './src/lib/parseOcr';
export { pagesFromZip } from './src/lib/fetchBook';
export { buildEpub, chapterise } from './src/lib/epub';
export { buildDocx } from './src/lib/docx';
export { buildPdf } from './src/lib/pdf';`,
      resolveDir: process.cwd(),
      sourcefile: 'lib-entry.ts',
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

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { books } = JSON.parse(await readFile('public/books.json', 'utf8'));
  const book = books.find((b) => b.id === bookId);
  if (!book) throw new Error(`No book with id "${bookId}"`);

  const { buildDoc, pagesFromZip, buildEpub, buildPdf } = await loadLib();

  process.stdout.write(`${book.title} — downloading… `);
  const res = await fetch(book.ocrUrl);
  if (!res.ok) throw new Error(`Archive fetch failed: ${res.status}`);
  const raw = new Uint8Array(await res.arrayBuffer());
  process.stdout.write(`${(raw.length / 1e6).toFixed(2)} MB\n`);

  const pages = await pagesFromZip(raw);
  const doc = buildDoc(pages);
  const epub = await buildEpub(book, doc);
  const pdf = await buildPdf(book, doc, {
    regular: await readFile('src/assets/fonts/FrankRuhlLibre-Regular.ttf'),
    bold: await readFile('src/assets/fonts/FrankRuhlLibre-Bold.ttf'),
  });

  await mkdir(outDir, { recursive: true });
  const out = join(outDir, `${book.id}.epub`);
  await writeFile(out, epub);
  const pdfOut = join(outDir, `${book.id}.pdf`);
  await writeFile(pdfOut, pdf);

  const headings = doc.blocks.filter((b) => b.kind === 'heading').length;
  console.log(
    `pages ${doc.pageCount} · blocks ${doc.blocks.length} (${headings} headings) · ` +
      `fidelity ${doc.fidelity} · epub ${(epub.length / 1e6).toFixed(2)} MB → ${out}
` +
      `pdf ${(pdf.length / 1e6).toFixed(2)} MB → ${pdfOut}`,
  );
}
