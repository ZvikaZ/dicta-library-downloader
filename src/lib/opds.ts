export interface OpdsExportFile {
  path: string;
  mime: string;
}

export interface OpdsExportedBook {
  id: string;
  title: string;
  titleEn?: string | null;
  author?: string | null;
  authorEn?: string | null;
  category: string;
  subcategory: string;
  provider: string;
  kind: string;
  sourceUrl?: string | null;
  files: Record<string, OpdsExportFile>;
}

export interface BuildOpdsInput {
  exported: OpdsExportedBook[];
  baseUrl?: string;
  pageSize?: number;
  now?: Date;
}

export interface BuildOpdsResult {
  files: Record<string, string>;
  categoryFiles: Record<string, string>;
}

function esc(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

export function normaliseBaseUrl(baseUrl = './files/'): string {
  const trimmed = String(baseUrl || './files/').trim();
  return `${trimmed.replace(/\/+$/, '')}/`;
}

/** FNV-1a (32-bit), stable across runtimes and character sets. */
export function fnv1a32(text: string): number {
  let hash = 0x811c9dc5;
  for (const ch of text) {
    hash ^= ch.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Category filenames stay stable and script-agnostic (Hebrew, Arabic, etc.). */
export function categorySlug(category: string): string {
  return `cat-${fnv1a32(String(category)).toString(16).padStart(8, '0')}`;
}

function feedXml({
  title,
  id,
  links = [],
  entries = [],
  updated,
}: {
  title: string;
  id: string;
  links?: Array<Record<string, string>>;
  entries?: string[];
  updated: string;
}): string {
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<feed xmlns="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/terms/">\n` +
    `  <id>${esc(id)}</id>\n` +
    `  <title>${esc(title)}</title>\n` +
    `  <updated>${updated}</updated>\n` +
    links
      .map(
        (link) =>
          `  <link ${Object.entries(link)
            .map(([k, v]) => `${k}="${esc(v)}"`)
            .join(' ')} />`,
      )
      .join('\n') +
    (links.length ? '\n' : '') +
    entries.join('\n') +
    `\n</feed>\n`
  );
}

function entryXml(item: OpdsExportedBook, baseUrl: string, updated: string): string {
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
    `    <updated>${updated}</updated>\n` +
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

export function buildOpdsFiles(input: BuildOpdsInput): BuildOpdsResult {
  const updated = (input.now ?? new Date()).toISOString();
  const pageSize = Math.max(1, Number.parseInt(String(input.pageSize ?? 200), 10) || 200);
  const baseUrl = normaliseBaseUrl(input.baseUrl);

  const exported = [...input.exported]
    .filter((item) => item.files && Object.keys(item.files).length > 0)
    .sort((a, b) => String(a.title).localeCompare(String(b.title), 'he'));

  if (exported.length === 0) throw new Error('Manifest has no exported files');

  const files: Record<string, string> = {};
  const allEntries = exported.map((item) => entryXml(item, baseUrl, updated));
  const allPages: string[][] = [];
  for (let i = 0; i < allEntries.length; i += pageSize) {
    allPages.push(allEntries.slice(i, i + pageSize));
  }

  for (let i = 0; i < allPages.length; i++) {
    const name = i === 0 ? 'all.xml' : `all-${i + 1}.xml`;
    const next = i + 1 < allPages.length ? `all-${i + 2}.xml` : null;
    const prev = i > 0 ? (i === 1 ? 'all.xml' : `all-${i}.xml`) : null;

    const links = [
      { rel: 'self', href: name, type: 'application/atom+xml;profile=opds-catalog;kind=acquisition' },
      { rel: 'start', href: 'index.xml', type: 'application/atom+xml;profile=opds-catalog;kind=navigation' },
    ];
    if (next)
      links.push({
        rel: 'next',
        href: next,
        type: 'application/atom+xml;profile=opds-catalog;kind=acquisition',
      });
    if (prev)
      links.push({
        rel: 'previous',
        href: prev,
        type: 'application/atom+xml;profile=opds-catalog;kind=acquisition',
      });

    files[name] = feedXml({
      title: `מדף — כל הספרים (${i + 1}/${allPages.length})`,
      id: `tag:madaf,2026:all:${i + 1}`,
      links,
      entries: allPages[i],
      updated,
    });
  }

  const byCategory = new Map<string, OpdsExportedBook[]>();
  for (const item of exported) {
    const key = String(item.category || 'ללא קטגוריה');
    const list = byCategory.get(key);
    if (list) list.push(item);
    else byCategory.set(key, [item]);
  }

  const usedFileNames = new Set<string>();
  const categoryFiles: Record<string, string> = {};
  const categoryLinks: string[] = [];
  for (const [category, items] of [...byCategory.entries()].sort((a, b) => a[0].localeCompare(b[0], 'he'))) {
    const base = `category-${categorySlug(category)}`;
    let name = `${base}.xml`;
    let n = 2;
    while (usedFileNames.has(name)) {
      name = `${base}-${n}.xml`;
      n += 1;
    }
    usedFileNames.add(name);
    categoryFiles[category] = name;

    files[name] = feedXml({
      title: `מדף — ${category}`,
      id: `tag:madaf,2026:category:${categorySlug(category)}`,
      links: [
        { rel: 'self', href: name, type: 'application/atom+xml;profile=opds-catalog;kind=acquisition' },
        { rel: 'start', href: 'index.xml', type: 'application/atom+xml;profile=opds-catalog;kind=navigation' },
      ],
      entries: items.map((item) => entryXml(item, baseUrl, updated)),
      updated,
    });

    categoryLinks.push(
      `  <entry>\n` +
        `    <title>${esc(category)} (${items.length})</title>\n` +
        `    <id>${esc(`tag:madaf,2026:nav:${name}`)}</id>\n` +
        `    <updated>${updated}</updated>\n` +
        `    <content type="text">קטלוג לפי קטגוריה</content>\n` +
        `    <link rel="subsection" href="${esc(name)}" type="application/atom+xml;profile=opds-catalog;kind=acquisition" />\n` +
        `  </entry>`,
    );
  }

  files['index.xml'] = feedXml({
    title: 'מדף — קטלוג OPDS ל-KOReader',
    id: 'tag:madaf,2026:index',
    links: [
      {
        rel: 'self',
        href: 'index.xml',
        type: 'application/atom+xml;profile=opds-catalog;kind=navigation',
      },
    ],
    entries: [
      `  <entry>\n` +
        `    <title>כל הספרים (${exported.length})</title>\n` +
        `    <id>tag:madaf,2026:nav:all</id>\n` +
        `    <updated>${updated}</updated>\n` +
        `    <content type="text">עיון בכל הספרים המיוצאים</content>\n` +
        `    <link rel="subsection" href="all.xml" type="application/atom+xml;profile=opds-catalog;kind=acquisition" />\n` +
        `  </entry>`,
      ...categoryLinks,
    ],
    updated,
  });

  return { files, categoryFiles };
}
