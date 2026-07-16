import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api";
import type { OsmAreaFeature, OsmSearchResult } from "../../shared/types";
import { MapView, type MapFeature } from "./MapView";

export interface AreaSelection {
  parent: OsmSearchResult | null;
  adminLevel: number;
  cacheKey: string;
  areas: OsmAreaFeature[];
  selectedIds: string[];
}

const EMPTY: AreaSelection = {
  parent: null,
  adminLevel: 8,
  cacheKey: "",
  areas: [],
  selectedIds: [],
};

export function AreaSelector({
  initial,
  onChange,
}: {
  initial?: AreaSelection;
  onChange: (sel: AreaSelection) => void;
}) {
  const [sel, setSel] = useState<AreaSelection>(initial ?? EMPTY);
  const [query, setQuery] = useState(initial?.parent?.name ?? "");
  const [results, setResults] = useState<OsmSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [loadingAreas, setLoadingAreas] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    onChangeRef.current(sel);
  }, [sel]);

  // Debounced city search.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2 || q === sel.parent?.name) {
      setResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearching(true);
      setError(null);
      try {
        setResults(await api.search(q));
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setSearching(false);
      }
    }, 450);
    return () => clearTimeout(timer);
  }, [query, sel.parent?.name]);

  const loadAreas = async (parent: OsmSearchResult, adminLevel: number) => {
    setLoadingAreas(true);
    setError(null);
    try {
      const res = await api.areas(parent.osmId, adminLevel);
      setSel((s) => ({
        ...s,
        parent,
        adminLevel,
        cacheKey: res.cacheKey,
        areas: res.areas,
        // keep only still-valid selections
        selectedIds: s.selectedIds.filter((id) => res.areas.some((a) => a.id === id)),
      }));
    } catch (e) {
      setError((e as Error).message);
      setSel((s) => ({ ...s, parent, adminLevel, areas: [], cacheKey: "", selectedIds: [] }));
    } finally {
      setLoadingAreas(false);
    }
  };

  const pickParent = (r: OsmSearchResult) => {
    setQuery(r.name);
    setResults([]);
    void loadAreas(r, sel.adminLevel);
  };

  const toggle = (id: string) => {
    setSel((s) => ({
      ...s,
      selectedIds: s.selectedIds.includes(id)
        ? s.selectedIds.filter((x) => x !== id)
        : [...s.selectedIds, id],
    }));
  };

  const selectedSet = useMemo(() => new Set(sel.selectedIds), [sel.selectedIds]);

  const features: MapFeature[] = useMemo(
    () =>
      sel.areas.map((a) => {
        const selected = selectedSet.has(a.id);
        return {
          area: { id: a.id, name: a.name, centroid: a.centroid, geometry: a.geometry },
          style: {
            color: "#000000",
            weight: selected ? 3 : 1,
            fillColor: selected ? "#38bdf8" : "#94a3b8",
            fillOpacity: selected ? 0.5 : 0.12,
          },
          onClick: () => toggle(a.id),
          tooltip: a.name,
        };
      }),
    [sel.areas, selectedSet],
  );

  return (
    <div className="wizard-body">
      <div>
        <label htmlFor="city">Search a city or district</label>
        <input
          id="city"
          value={query}
          placeholder="e.g. Utrecht, Camden, Kreuzberg"
          autoCorrect="off"
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="field-hint">
          Pick an administrative boundary, then choose which sub-level to divide it into.
        </div>
      </div>

      {searching && <div className="spinner" />}
      {results.length > 0 && (
        <div className="results">
          {results.map((r) => (
            <button
              key={`${r.osmType}${r.osmId}`}
              className="result"
              onClick={() => pickParent(r)}
            >
              {r.name}
              <small>
                {r.displayName}
                {r.adminLevel != null ? ` · admin level ${r.adminLevel}` : ""}
              </small>
            </button>
          ))}
        </div>
      )}

      {sel.parent && (
        <div>
          <label>Sub-division level</label>
          <div className="chips">
            {[8, 9, 10].map((lvl) => (
              <button
                key={lvl}
                className={`chip ${sel.adminLevel === lvl ? "active" : ""}`}
                onClick={() => sel.parent && void loadAreas(sel.parent, lvl)}
              >
                Level {lvl}
              </button>
            ))}
          </div>
          <div className="field-hint">
            Level 8 ≈ municipalities/suburbs · 9–10 ≈ neighbourhoods (availability varies by
            country).
          </div>
        </div>
      )}

      {loadingAreas && <div className="spinner" />}

      {sel.areas.length > 0 && (
        <>
          <div className="row-between">
            <span className="pill">{sel.areas.length} areas found</span>
            <span className="pill" style={{ background: "#0ea5e9", color: "#04121f" }}>
              {sel.selectedIds.length} selected
            </span>
          </div>
          <div className="btn-row">
            <button
              className="btn secondary"
              onClick={() => setSel((s) => ({ ...s, selectedIds: s.areas.map((a) => a.id) }))}
            >
              Select all
            </button>
            <button
              className="btn ghost"
              onClick={() => setSel((s) => ({ ...s, selectedIds: [] }))}
            >
              Deselect all
            </button>
          </div>
          <MapView features={features} fitSignature={sel.cacheKey} className="map grow" />
          <div className="hint">Tap areas on the map to include them in the game.</div>
        </>
      )}

      {error && <div className="error-toast">{error}</div>}
    </div>
  );
}
