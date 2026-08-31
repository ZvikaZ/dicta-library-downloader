import { describe, expect, it } from 'vitest';
import { DICTA_ATTRIBUTION, licenseFor, sefariaAttribution } from './attribution';

describe('reading a licence', () => {
  it('recognises the spellings Sefaria actually ships', () => {
    // `PD` and `Public Domain` both occur in the same catalogue.
    expect(licenseFor('PD').name).toBe(licenseFor('Public Domain').name);
    expect(licenseFor('CC-BY-SA').name).toBe('Creative Commons BY-SA 4.0');
    expect(licenseFor('cc-by-nc').name).toBe('Creative Commons BY-NC 4.0');
  });

  it('treats an undocumented licence as undocumented, not as forbidden', () => {
    for (const raw of ['unknown', '', null, undefined, '   ']) {
      const license = licenseFor(raw);
      expect(license.name).toBe('לא מתועד');
      expect(license.exportable).toBe(true);
    }
  });

  // The two in the sample were `Copyright: Schocken` and
  // `Copyright: Chabad House Publications`.
  it('refuses to export an edition with a named rights holder', () => {
    const license = licenseFor('Copyright: Schocken');
    expect(license.exportable).toBe(false);
    expect(license.name).toBe('Copyright: Schocken');
  });

  it('names an unrecognised licence rather than hiding it', () => {
    expect(licenseFor('Some Bespoke Terms').name).toBe('Some Bespoke Terms');
  });
});

describe('crediting a library', () => {
  it('credits Dicta under the licence its whole library carries', () => {
    expect(DICTA_ATTRIBUTION.library).toBe('הספרייה של דיקטה');
    expect(DICTA_ATTRIBUTION.license.name).toBe('Creative Commons BY-SA 4.0');
    expect(DICTA_ATTRIBUTION.provenance).toMatch(/OCR/);
  });

  // A Sefaria work can be public domain in one edition and restricted in
  // another, so the credit has to follow the version that was loaded.
  it('takes the licence from the edition, not from the library', () => {
    const pd = sefariaAttribution({ versionTitle: 'Torat Emet 363', license: 'Public Domain' });
    const owned = sefariaAttribution({ versionTitle: 'Schocken', license: 'Copyright: Schocken' });

    expect(pd.library).toBe('ספריא');
    expect(owned.library).toBe('ספריא');
    expect(pd.license.exportable).toBe(true);
    expect(owned.license.exportable).toBe(false);
  });

  it('names the edition, which is what a citation needs', () => {
    expect(sefariaAttribution({ versionTitle: 'Wikisource Mishneh Torah' }).provenance).toContain(
      'Wikisource Mishneh Torah',
    );
  });

  it('credits the edition source only when there is one', () => {
    expect(sefariaAttribution({}).dataUrl).toBeUndefined();
    expect(sefariaAttribution({ versionSource: 'https://he.wikisource.org/x' }).dataUrl).toBe(
      'https://he.wikisource.org/x',
    );
  });

  it('never claims the Dicta OCR caveat for a Sefaria text', () => {
    expect(sefariaAttribution({}).provenance).not.toMatch(/OCR/);
  });
});
