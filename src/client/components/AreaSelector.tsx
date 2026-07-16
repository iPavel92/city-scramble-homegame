import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api";
import type { OsmAreaFeature, OsmSearchResult } from "../../shared/types";
import { MapView, type MapFeature } from "./MapView";
import { useI18n } from "../i18n";

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
  const { t, lang } = useI18n();
  const [sel, setSel] = useState<AreaSelection>(initial ?? EMPTY);
  const [query, setQuery] = useState(initial?.parent?.name ?? "");
  const [results, setResults] = useState<OsmSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [loadingAreas, setLoadingAreas] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewBounds, setViewBounds] = useState<{
    s: number;
    w: number;
    n: number;
    e: number;
  } | null>(null);
  // When on, the level chips search the current map view instead of the city.
  const [searchInView, setSearchInView] = useState(false);
  // Bumped only when we want the map to refit (parent/level search), not on a
  // "search this view" query, so the framed viewport stays put.
  const [fitNonce, setFitNonce] = useState(0);
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
        setResults(await api.search(q, lang));
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setSearching(false);
      }
    }, 450);
    return () => clearTimeout(timer);
  }, [query, sel.parent?.name, lang]);

  const loadAreas = async (parent: OsmSearchResult, adminLevel: number) => {
    setLoadingAreas(true);
    setError(null);
    try {
      const res = await api.areas(parent.osmId, adminLevel, lang);
      setSel((s) => ({
        ...s,
        parent,
        adminLevel,
        cacheKey: res.cacheKey,
        areas: res.areas,
        // keep only still-valid selections
        selectedIds: s.selectedIds.filter((id) => res.areas.some((a) => a.id === id)),
      }));
      setFitNonce((n) => n + 1); // refit to the new parent/level result
    } catch (e) {
      setError((e as Error).message);
      setSel((s) => ({ ...s, parent, adminLevel, areas: [], cacheKey: "", selectedIds: [] }));
    } finally {
      setLoadingAreas(false);
    }
  };

  // Re-run the search for the current level within the current map viewport
  // (may include areas from other cities). Keeps the current framing.
  const loadAreasInView = async (adminLevel: number) => {
    if (!viewBounds) return;
    setLoadingAreas(true);
    setError(null);
    try {
      const res = await api.areasInView(adminLevel, viewBounds, lang);
      setSel((s) => ({
        ...s,
        adminLevel,
        cacheKey: res.cacheKey,
        areas: res.areas,
        selectedIds: s.selectedIds.filter((id) => res.areas.some((a) => a.id === id)),
      }));
    } catch (e) {
      setError((e as Error).message);
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
        <label htmlFor="city">{t("searchCityLabel")}</label>
        <input
          id="city"
          value={query}
          placeholder={t("searchCityPlaceholder")}
          autoCorrect="off"
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="field-hint">{t("searchCityHint")}</div>
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
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={searchInView}
              onChange={(e) => setSearchInView(e.target.checked)}
            />
            <span>{t("searchInView")}</span>
          </label>

          <label>{t("subDivisionLevel")}</label>
          <div className="chips">
            {[8, 9, 10].map((lvl) => (
              <button
                key={lvl}
                className={`chip ${sel.adminLevel === lvl ? "active" : ""}`}
                disabled={loadingAreas || (searchInView && !viewBounds)}
                onClick={() => {
                  if (searchInView) void loadAreasInView(lvl);
                  else if (sel.parent) void loadAreas(sel.parent, lvl);
                }}
              >
                {t("level", { n: lvl })}
              </button>
            ))}
          </div>
          <div className="field-hint">
            {searchInView ? t("searchInViewHint") : t("levelHint")}
          </div>
        </div>
      )}

      {loadingAreas && <div className="spinner" />}

      {sel.areas.length > 0 && (
        <>
          <div className="row-between">
            <span className="pill">{t("areasFound", { n: sel.areas.length })}</span>
            <span className="pill" style={{ background: "#0ea5e9", color: "#04121f" }}>
              {t("areasSelected", { n: sel.selectedIds.length })}
            </span>
          </div>
          <div className="btn-row">
            <button
              className="btn secondary"
              onClick={() => setSel((s) => ({ ...s, selectedIds: s.areas.map((a) => a.id) }))}
            >
              {t("selectAll")}
            </button>
            <button
              className="btn ghost"
              onClick={() => setSel((s) => ({ ...s, selectedIds: [] }))}
            >
              {t("deselectAll")}
            </button>
          </div>
          <MapView
            features={features}
            fitSignature={String(fitNonce)}
            className="map grow"
            onBoundsChange={setViewBounds}
          />
          <div className="hint">{t("tapAreasHint")}</div>
        </>
      )}

      {error && <div className="error-toast">{error}</div>}
    </div>
  );
}
