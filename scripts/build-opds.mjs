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
const baseUrl = args.get('--base-url') ?? './files/';
const pageSize = Math.max(1, Number.parseInt(args.get('--page-size') ?? '200', 10) || 200);

async function loadLib() {
  const entry = join(tmpdir(), `dicta-opds-${Date.now()}.mjs`);
  await build({
    stdin: {
      contents: `export { mergeCatalogues } from './src/lib/catalogue';\nexport { buildOpdsFiles } from './src/lib/opds';`,
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
const { mergeCatalogues, buildOpdsFiles } = await loadLib();
const merged = mergeCatalogues([JSON.parse(dictaRaw), JSON.parse(sefariaRaw)]);
const byId = new Map(merged.books.map((b) => [b.id, b]));

const exported = (manifest.exported ?? []).map((item) => {
  const fromCatalogue = byId.get(item.id);
  return fromCatalogue
    ? {
        ...item,
        category: fromCatalogue.category,
        subcategory: fromCatalogue.subcategory,
      }
    : item;
});

const { files, categoryFiles } = buildOpdsFiles({ exported, baseUrl, pageSize });

await mkdir(outputDir, { recursive: true });
await Promise.all(Object.entries(files).map(([name, xml]) => writeFile(join(outputDir, name), xml)));

console.log(
  `Wrote OPDS catalog in ${outputDir}: index.xml, ${Object.keys(files).filter((f) => /^all(?:-\d+)?\.xml$/.test(f)).length} all-feed page(s), ${Object.keys(categoryFiles).length} category feeds`,
);
