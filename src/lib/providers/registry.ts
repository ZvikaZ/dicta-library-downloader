/**
 * The libraries this app draws from.
 *
 * This is the single place a source is declared. Adding one means adding an
 * entry here, a loader module beside this file, and a build script that writes
 * its catalogue — nothing else in the app needs to know how many there are, and
 * `Provider` widens automatically.
 */
export const PROVIDERS = {
  dicta: {
    /** Shown in the מקור facet and in every colophon. */
    label: 'דיקטה',
    /** The catalogue file under public/, written by its fetch script. */
    catalogue: 'books.json',
    site: 'https://library.dicta.org.il',
  },
  sefaria: {
    label: 'ספריא',
    catalogue: 'books-sefaria.json',
    site: 'https://www.sefaria.org',
  },
} as const;

export type Provider = keyof typeof PROVIDERS;

export const PROVIDER_IDS = Object.keys(PROVIDERS) as Provider[];

export function providerLabel(provider: Provider): string {
  return PROVIDERS[provider]?.label ?? provider;
}

/** The label a book's מקור facet entry carries, from its provider id. */
export function isProvider(value: string): value is Provider {
  return value in PROVIDERS;
}
