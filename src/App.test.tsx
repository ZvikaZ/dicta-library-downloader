import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { makeBook } from './test/fixtures';
import type { Catalogue } from './lib/types';

const exportBook = vi.hoisted(() => vi.fn());
// BookDetail loads this module lazily on the first download; the labels it
// paints with come from ./lib/formats, which stays real.
vi.mock('./lib/exporter', () => ({ exportBook }));

const books = [
  makeBook({
    id: 'alfeimenashe',
    title: 'אלפי מנשה חלק א',
    author: 'מנשה בן פורת',
    category: 'מחשבה ומוסר',
    subcategory: 'מחשבה (אחרונים)',
    year: 1880,
    key: 'אלפי מנשה חלק א מנשה בן פורת',
  }),
  makeBook({
    id: 'alfeimenashetorah',
    // The gershayim here is the U+05F4 character, not a plain quote.
    title: 'אלפי מנשה עה״ת',
    author: 'מנשה איכנשטין',
    category: 'חסידות',
    subcategory: 'ת"ר - ת"ש',
    year: 1935,
    key: 'אלפי מנשה עהת מנשה איכנשטין',
  }),
  makeBook({
    id: 'achiezer',
    title: 'אחיעזר אבן העזר',
    author: 'חיים עוזר גרודזינסקי',
    category: 'שאלות ותשובות (שו"ת)',
    subcategory: 'אחרונים - מערב',
    year: 1922,
    key: 'אחיעזר אבן העזר חיים עוזר גרודזינסקי',
  }),
];

const catalogue: Catalogue = {
  facets: {
    categories: [
      { name: 'שאלות ותשובות (שו"ת)', count: 1 },
      { name: 'מחשבה ומוסר', count: 1 },
      { name: 'חסידות', count: 1 },
    ],
    subcategories: [
      { name: 'מחשבה (אחרונים)', count: 1 },
      { name: 'ת"ר - ת"ש', count: 1 },
      { name: 'אחרונים - מערב', count: 1 },
    ],
    yearRange: [1880, 1935],
    total: 3,
    fetchedAt: '2026-08-27',
  },
  books,
};

function mockCatalogue(payload: unknown = catalogue, ok = true) {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve({ ok, status: ok ? 200 : 404, json: () => Promise.resolve(payload) })),
  );
}

beforeEach(() => {
  exportBook.mockReset();
  exportBook.mockResolvedValue(undefined);
  window.history.replaceState(null, '', '/');
  mockCatalogue();
});

afterEach(() => vi.unstubAllGlobals());

/** Wait for the catalogue fetch to settle and the list to render. */
async function renderApp() {
  render(<App />);
  await screen.findByText('אלפי מנשה חלק א');
}

describe('catalogue browsing', () => {
  it('credits Dicta with a link on every view', async () => {
    await renderApp();
    const links = screen.getAllByRole('link', { name: /דיקטה/ });
    expect(links.length).toBeGreaterThan(0);
    expect(links[0]).toHaveAttribute('href', 'https://library.dicta.org.il');
  });

  it('lists every book with its author, place and year', async () => {
    await renderApp();
    expect(screen.getByText('אחיעזר אבן העזר')).toBeInTheDocument();
    expect(screen.getByText(/מנשה בן פורת/)).toBeInTheDocument();
    expect(screen.getByText('3 ספרים')).toBeInTheDocument();
  });

  it('reports a load failure instead of rendering an empty catalogue', async () => {
    mockCatalogue(null, false);
    render(<App />);
    expect(await screen.findByText('טעינת רשימת הספרים נכשלה.')).toBeInTheDocument();
  });
});

describe('filtering', () => {
  it('narrows the list as you type', async () => {
    const user = userEvent.setup();
    await renderApp();

    await user.type(screen.getByPlaceholderText(/חיפוש/), 'אחיעזר');
    await waitFor(() => expect(screen.getByText('1 ספרים מתוך 3')).toBeInTheDocument());
    expect(screen.queryByText('אלפי מנשה חלק א')).not.toBeInTheDocument();
  });

  it('matches Hebrew regardless of gershayim and quoting', async () => {
    const user = userEvent.setup();
    await renderApp();

    // The title is spelled with ״ (U+05F4); the reader types nothing at all
    // in that position. Both must find it.
    await user.type(screen.getByPlaceholderText(/חיפוש/), 'עהת');
    await waitFor(() => expect(screen.getByText('אלפי מנשה עה״ת')).toBeInTheDocument());
    expect(screen.queryByText('אחיעזר אבן העזר')).not.toBeInTheDocument();
  });

  it('treats separate words as independent terms in any order', async () => {
    const user = userEvent.setup();
    await renderApp();

    await user.type(screen.getByPlaceholderText(/חיפוש/), 'פורת מנשה');
    await waitFor(() => expect(screen.getByText('1 ספרים מתוך 3')).toBeInTheDocument());
    expect(screen.getByText('אלפי מנשה חלק א')).toBeInTheDocument();
  });

  it('filters by category', async () => {
    const user = userEvent.setup();
    await renderApp();

    await user.click(screen.getByRole('checkbox', { name: /חסידות/ }));
    await waitFor(() => expect(screen.getByText('1 ספרים מתוך 3')).toBeInTheDocument());
    expect(screen.getByText('אלפי מנשה עה״ת')).toBeInTheDocument();
  });

  it('offers only the subcategories reachable under the chosen category', async () => {
    const user = userEvent.setup();
    await renderApp();

    const subGroup = () => screen.getByRole('group', { name: 'תת־קטגוריה' });
    expect(within(subGroup()).getAllByRole('checkbox')).toHaveLength(3);

    await user.click(screen.getByRole('checkbox', { name: /חסידות/ }));
    await waitFor(() => expect(within(subGroup()).getAllByRole('checkbox')).toHaveLength(1));
    expect(within(subGroup()).getByRole('checkbox', { name: /ת"ר/ })).toBeInTheDocument();
  });

  it('filters by year range', async () => {
    await renderApp();

    // A single change event, as a spinner or a paste produces — typing digit by
    // digit into a controlled number field re-parses each prefix.
    fireEvent.change(screen.getByLabelText('משנה'), { target: { value: '1930' } });
    await waitFor(() => expect(screen.getByText('1 ספרים מתוך 3')).toBeInTheDocument());
    expect(screen.getByText('אלפי מנשה עה״ת')).toBeInTheDocument();
  });

  it('clears every filter at once', async () => {
    const user = userEvent.setup();
    await renderApp();

    await user.click(screen.getByRole('checkbox', { name: /חסידות/ }));
    await waitFor(() => expect(screen.getByText('1 ספרים מתוך 3')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'ניקוי הסינון' }));
    await waitFor(() => expect(screen.getByText('3 ספרים')).toBeInTheDocument());
  });

  it('says so plainly when nothing matches', async () => {
    const user = userEvent.setup();
    await renderApp();

    await user.type(screen.getByPlaceholderText(/חיפוש/), 'זזזזז');
    expect(await screen.findByText('לא נמצאו ספרים התואמים את החיפוש.')).toBeInTheDocument();
  });

  it('puts the query in the URL so a view can be shared', async () => {
    const user = userEvent.setup();
    await renderApp();

    await user.type(screen.getByPlaceholderText(/חיפוש/), 'אחיעזר');
    await waitFor(() => expect(window.location.search).toContain('q='));
    await user.click(screen.getByRole('checkbox', { name: /חסידות/ }));
    await waitFor(() => expect(window.location.search).toContain('cat='));
  });

  it('restores the query from the URL on load', async () => {
    window.history.replaceState(null, '', '/?q=' + encodeURIComponent('אחיעזר'));
    render(<App />);
    expect(await screen.findByText('אחיעזר אבן העזר')).toBeInTheDocument();
    expect(screen.queryByText('אלפי מנשה חלק א')).not.toBeInTheDocument();
  });
});

describe('sorting', () => {
  it('orders by year when asked', async () => {
    const user = userEvent.setup();
    await renderApp();

    await user.selectOptions(screen.getByRole('combobox'), 'year');
    await waitFor(() => {
      const titles = screen.getAllByRole('button').map((b) => b.textContent ?? '');
      const years = titles.filter((t) => /18|19/.test(t));
      expect(years[0]).toContain('אלפי מנשה חלק א'); // 1880
    });
  });
});

describe('book detail and download', () => {
  it('opens a dialogue with the book metadata', async () => {
    const user = userEvent.setup();
    await renderApp();

    await user.click(screen.getByText('אלפי מנשה חלק א'));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('מנשה בן פורת')).toBeInTheDocument();
    expect(within(dialog).getByText('1880')).toBeInTheDocument();
    expect(within(dialog).getByText(/זיהוי תווים אוטומטי/)).toBeInTheDocument();
  });

  it('exports the chosen format for the chosen book', async () => {
    const user = userEvent.setup();
    await renderApp();

    await user.click(screen.getByText('אלפי מנשה חלק א'));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'EPUB' }));

    await waitFor(() => expect(exportBook).toHaveBeenCalledTimes(1));
    expect(exportBook.mock.calls[0][0].id).toBe('alfeimenashe');
    expect(exportBook.mock.calls[0][1]).toBe('epub');
  });

  it('offers Word and PDF as well as EPUB', async () => {
    const user = userEvent.setup();
    await renderApp();

    await user.click(screen.getByText('אלפי מנשה חלק א'));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Word' }));
    await waitFor(() => expect(exportBook.mock.calls[0][1]).toBe('docx'));

    await user.click(within(dialog).getByRole('button', { name: /PDF/ }));
    await waitFor(() => expect(exportBook.mock.calls[1][1]).toBe('print'));
  });

  it('surfaces the reason an export failed', async () => {
    exportBook.mockRejectedValue(new Error('הורדת הספר נכשלה (503)'));
    const user = userEvent.setup();
    await renderApp();

    await user.click(screen.getByText('אלפי מנשה חלק א'));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'EPUB' }));

    expect(await within(dialog).findByText('הורדת הספר נכשלה (503)')).toBeInTheDocument();
  });

  it('re-enables the buttons after a failure so the reader can retry', async () => {
    exportBook.mockRejectedValue(new Error('נכשל'));
    const user = userEvent.setup();
    await renderApp();

    await user.click(screen.getByText('אלפי מנשה חלק א'));
    const dialog = await screen.findByRole('dialog');
    const epub = within(dialog).getByRole('button', { name: 'EPUB' });
    await user.click(epub);

    await waitFor(() => expect(epub).toBeEnabled());
  });

  it('closes on Escape', async () => {
    const user = userEvent.setup();
    await renderApp();

    await user.click(screen.getByText('אלפי מנשה חלק א'));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});
