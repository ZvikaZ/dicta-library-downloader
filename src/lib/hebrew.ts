/**
 * The Hebrew marks the export font cannot set.
 *
 * Frank Ruhl Libre, which all three exports embed or ask for, has every Hebrew
 * vowel — meteg included — but **not one** of the 31 cantillation accents, nor
 * the three rare marks below. A glyph the font lacks is a box in a PDF and in
 * any EPUB reader that honours the embedded font, so a verse of Tanakh comes
 * out as `לְרֵ □יחַ □שְׁמָנֶ □יךָ`.
 *
 * Removing them keeps the text fully vocalised and correct — it only loses the
 * chant. That is the same trade a printed commentary volume usually makes; a
 * Miqraot Gedolot sets the te'amim, a Malbim on its own generally does not.
 *
 * The reader does not use this: a browser falls back to a system Hebrew font
 * per missing glyph, so on screen the accents show properly.
 */
const UNSUPPORTED =
  // U+0591–U+05AF: the te'amim. U+05C4/05C5: the puncta extraordinaria.
  // U+05C6: nun hafukha, which the font also has no glyph for.
  /[֑-֯ׄ-׆]/g;

export function stripUnsupportedMarks(text: string): string {
  return text.replace(UNSUPPORTED, '');
}

/** Whether a string carries any of them — used only by the tests. */
export function hasUnsupportedMarks(text: string): boolean {
  UNSUPPORTED.lastIndex = 0;
  return UNSUPPORTED.test(text);
}
