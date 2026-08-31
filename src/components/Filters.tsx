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

      {facets.sources && facets.sources.length > 1 && (
        <FacetGroup
          title="מקור"
          items={facets.sources}
          selected={query.sources}
          onToggle={(name) => onChange({ ...query, sources: toggle(query.sources, name) })}
        />
      )}

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

    </aside>
  );
}
