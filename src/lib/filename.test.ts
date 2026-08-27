import { describe, expect, it } from 'vitest';
import { alfeiMenashe, makeBook } from '../test/fixtures';
import { downloadName } from './filename';

describe('download file names', () => {
  it('names files after the Hebrew title, not the internal slug', () => {
    expect(downloadName(alfeiMenashe, 'epub')).toBe('אלפי מנשה חלק א.epub');
    expect(downloadName(alfeiMenashe, 'pdf')).toBe('אלפי מנשה חלק א.pdf');
    expect(downloadName(alfeiMenashe, 'docx')).toBe('אלפי מנשה חלק א.docx');
  });

  it('strips characters filesystems reject, keeping the Hebrew intact', () => {
    // Gershayim in titles is common: אלפי מנשה עה"ת
    const book = makeBook({ id: 'x', title: 'אלפי מנשה עה"ת: חלק א/ב' });
    const name = downloadName(book, 'epub');
    expect(name).toBe('אלפי מנשה עהת חלק אב.epub');
    expect(name).not.toMatch(/[\/:*?"<>|]/);
  });

  it('falls back to the id when a title yields nothing usable', () => {
    expect(downloadName(makeBook({ id: 'achiezer', title: '///' }), 'pdf')).toBe('achiezer.pdf');
    expect(downloadName(makeBook({ id: 'achiezer', title: '   ' }), 'pdf')).toBe('achiezer.pdf');
  });

  it('avoids names Windows reserves', () => {
    expect(downloadName(makeBook({ id: 'book1', title: 'CON' }), 'epub')).toBe('book1.epub');
  });

  it('never ends the name with a dot or space', () => {
    const name = downloadName(makeBook({ id: 'x', title: 'ספר כלשהו. ' }), 'epub');
    expect(name).toBe('ספר כלשהו.epub');
  });

  it('caps absurdly long titles', () => {
    const name = downloadName(makeBook({ id: 'x', title: 'א'.repeat(400) }), 'epub');
    expect(name.length).toBeLessThanOrEqual(130);
    expect(name.endsWith('.epub')).toBe(true);
  });
});
