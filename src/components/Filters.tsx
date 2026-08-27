import type { Facet, Facets } from '../lib/types';
import type { Query } from '../lib/search';

interface Props {
  facets: Facets;
  subcategories: string[];
  query: Query;
  onChange: (q: Query) => void;
}

function toggle(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

function FacetGroup({
  title,
  items,
  selected,
  onToggle,
}: {
  title: string;
  items: Facet[];
  selected: string[];
  onToggle: (name: string) => void;
}) {
  return (
    <div className="facet">
      <h3>{title}</h3>
      <div className="facet-list" role="group" aria-label={title}>
        {items.map((f) => (
          <label className="facet-item" key={f.name}>
            <input
              type="checkbox"
              checked={selected.includes(f.name)}
              onChange={() => onToggle(f.name)}
            />
            <span>{f.name}</span>
            <span className="count">{f.count}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

export function Filters({ facets, subcategories, query, onChange }: Props) {
  const [minYear, maxYear] = facets.yearRange;
  const years = query.years ?? facets.yearRange;

  const setYears = (index: 0 | 1, raw: string) => {
    const n = Number.parseInt(raw, 10);
    if (!Number.isFinite(n)) return;
    const next: [number, number] = [...years] as [number, number];
    next[index] = n;
    onChange({ ...query, years: next });
  };

  // Only subcategories reachable under the current category selection.
  const subFacets = facets.subcategories.filter((s) => subcategories.includes(s.name));

  return (
    <aside className="sidebar">
      <div className="search-box">
        <label htmlFor="q" className="visually-hidden" style={{ display: 'none' }}>
          חיפוש
        </label>
        <input
          id="q"
          type="search"
          placeholder="חיפוש לפי שם, מחבר, מקום…"
          value={query.text}
          onChange={(e) => onChange({ ...query, text: e.target.value })}
        />
      </div>

      <FacetGroup
        title="קטגוריה"
        items={facets.categories}
        selected={query.categories}
        onToggle={(name) =>
          // Clear subcategories that the new category set no longer contains.
          onChange({ ...query, categories: toggle(query.categories, name), subcategories: [] })
        }
      />

      <FacetGroup
        title="תת־קטגוריה"
        items={subFacets}
        selected={query.subcategories}
        onToggle={(name) => onChange({ ...query, subcategories: toggle(query.subcategories, name) })}
      />

      <div className="facet">
        <h3>שנת דפוס</h3>
        <div className="year-row">
          <input
            type="number"
            aria-label="משנה"
            min={minYear}
            max={maxYear}
            value={years[0]}
            onChange={(e) => setYears(0, e.target.value)}
          />
          <span aria-hidden="true">–</span>
          <input
            type="number"
            aria-label="עד שנה"
            min={minYear}
            max={maxYear}
            value={years[1]}
            onChange={(e) => setYears(1, e.target.value)}
          />
        </div>
        {query.years && (
          <button
            type="button"
            className="link-button"
            style={{ marginTop: 8 }}
            onClick={() => onChange({ ...query, years: null })}
          >
            ביטול סינון שנים
          </button>
        )}
      </div>
    </aside>
  );
}
