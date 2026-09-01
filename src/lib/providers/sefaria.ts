import { combinedLicense, sefariaAttribution } from '../attribution';
import { buildSefariaDoc, weaveCommentary, type TextNode } from '../sefariaDoc';
import type { BookDoc } from '../types';
import type { LoadBook } from './types';

const API = 'https://www.sefaria.org/api';

/**
 * The whole library is served with `Access-Control-Allow-Origin: *`.
 *
 * `label`, when given, names the specific section this call is for (its ref),
 * so a failure that survives every retry says which part of the book could
 * not be downloaded rather than just a bare status code.
 */
async function getJson<T>(url: string, label?: string): Promise<T> {
  // Cold refs return the odd 504, and a large complex book fires off a
  // request per section — with that many round trips, a transient hiccup on
  // one of them is expected. Three attempts with a growing pause clears most
  // of that; only a section that is still failing after that is a real error.
  const attempts = 3;
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url);
    if (res.ok) return (await res.json()) as T;
    if (attempt >= attempts) {
      throw new Error(
        label
          ? `הורדת הקטע "${label}" נכשלה אחרי ${attempts} ניסיונות (שגיאה ${res.status})`
          : `הורדת הספר נכשלה (${res.status})`,
      );
    }
    await new Promise((r) => setTimeout(r, attempt * 800));
  }
}

interface SchemaNode {
  nodeType?: string;
  key?: string;
  /** Titles per language; the raw index carries no flat `title` field. */
  titles?: { lang: string; text: string; primary?: boolean }[];
  nodes?: SchemaNode[];
  depth?: number;
}

function titleIn(node: SchemaNode, lang: string): string | undefined {
  const titles = node.titles?.filter((t) => t.lang === lang) ?? [];
  return (titles.find((t) => t.primary) ?? titles[0])?.text;
}

interface TextResponse {
  versions?: {
    text: TextNode['text'];
    language?: string;
    versionTitle?: string;
    license?: string;
    versionSource?: string;
  }[];
  sectionNames?: string[];
  addressTypes?: string[];
  error?: string;
}

/**
 * Complex books reject a book-level ref and have to be fetched node by node.
 *
 * Their schema is a tree whose leaves are the addressable texts; the branch
 * titles join with commas to form the ref, exactly as they appear in a
 * citation (`Pesach Haggadah, Magid, Ha Lachma Anya`).
 */
function leafRefs(node: SchemaNode, path: string[] = []): { ref: string; heTitle?: string }[] {
  const here = [...path, titleIn(node, 'en') ?? node.key ?? ''].filter(Boolean);
  if (!node.nodes?.length) return [{ ref: here.join(', '), heTitle: titleIn(node, 'he') }];
  return node.nodes.flatMap((child) => leafRefs(child, here));
}

/** A complex book's licence is carried by its sections, not by the book ref. */
async function firstVersion(ref: string) {
  const res = await getJson<TextResponse>(
    `${API}/v3/texts/${encodeURIComponent(ref)}?version=source`,
    ref,
  );
  return res.versions?.[0];
}

async function fetchNode(ref: string, heTitle?: string): Promise<TextNode | null> {
  const url = `${API}/v3/texts/${encodeURIComponent(ref)}?version=source`;
  const res = await getJson<TextResponse>(url, ref);
  const version = res.versions?.[0];
  if (!version) return null;
  return {
    heTitle,
    sectionNames: res.sectionNames ?? [],
    addressTypes: res.addressTypes ?? [],
    text: version.text,
  };
}

/**
 * Sefaria serves a "simple" book whole in one request — a few hundred KB, well
 * under a second. Only a complex book costs one request per section, so the
 * cheap path is tried first and the schema is only fetched if it fails.
 */
export const loadBook: LoadBook = async (book, onProgress): Promise<BookDoc> => {
  const doc = await loadText(book.ref, onProgress);

  // A commentary is read woven into the work it comments on, the way a printed
  // commentary sets the verse above the comment.
  if (book.kind === 'commentary' && book.baseRef) {
    const base = await loadText(book.baseRef);
    return {
      ...doc,
      blocks: weaveCommentary(base, doc),
      // The commentary leads — it is its book — but both sources are credited,
      // and the stricter of the two licences governs the whole.
      alsoFrom: [base.attribution],
      attribution: {
        ...doc.attribution,
        license: combinedLicense([doc.attribution, base.attribution]),
      },
    };
  }

  return doc;
};

async function loadText(ref: string, onProgress?: Parameters<LoadBook>[1]): Promise<BookDoc> {
  onProgress?.('download', 0.1);

  const whole = await fetch(
    `${API}/v3/texts/${encodeURIComponent(ref)}?version=source`,
  ).then((r) => r.json() as Promise<TextResponse>);

  let nodes: TextNode[];
  // The licence belongs to the edition, so it is read from whichever version
  // actually came back rather than assumed from the library.
  let version: NonNullable<TextResponse['versions']>[number] | undefined = whole.versions?.[0];

  if (!whole.error && whole.versions?.[0]) {
    onProgress?.('download', 1);
    nodes = [
      {
        sectionNames: whole.sectionNames ?? [],
        addressTypes: whole.addressTypes ?? [],
        text: whole.versions[0].text,
      },
    ];
  } else {
    // Complex book: walk the schema and pull each leaf.
    const index = await getJson<{ schema: SchemaNode }>(
      `${API}/v2/raw/index/${encodeURIComponent(ref)}`,
    );
    const refs = leafRefs(index.schema);
    if (refs.length === 0) throw new Error('לא נמצא טקסט לספר הזה');
    version = await firstVersion(refs[0].ref);

    // The Haggadah is 38 sections; fetched one at a time that is eight seconds
    // of latency. Six at once keeps it near one, and the results are placed by
    // index so the book stays in its schema order.
    const fetched: (TextNode | null)[] = new Array(refs.length).fill(null);
    let next = 0;
    let done = 0;
    await Promise.all(
      Array.from({ length: Math.min(6, refs.length) }, async () => {
        for (;;) {
          const i = next++;
          if (i >= refs.length) return;
          fetched[i] = await fetchNode(refs[i].ref, refs[i].heTitle);
          onProgress?.('download', ++done / refs.length);
        }
      }),
    );
    nodes = fetched.filter((n): n is TextNode => n !== null);
  }

  onProgress?.('parse', 1);
  const doc = buildSefariaDoc(nodes, sefariaAttribution(version ?? {}));
  if (doc.blocks.length === 0) throw new Error('לא נמצא טקסט לספר הזה');

  onProgress?.('build', 1);
  return doc;
}
