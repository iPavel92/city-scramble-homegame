import osmtogeojson from "osmtogeojson";
import type {
  AreaGeometry,
  LngLat,
  OsmAreaFeature,
  OsmAreasResponse,
  OsmSearchResult,
} from "../shared/types";
import { centroidOf, simplifyGeometry } from "./geo";

const USER_AGENT =
  "CityScramble/0.1 (multiplayer homegame; https://github.com/iPavel92/city-scramble-homegame)";
const NOMINATIM = "https://nominatim.openstreetmap.org/search";
// The public Overpass instances return 429/504 under load; try mirrors in turn.
const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
];
const OSM_ATTRIBUTION = "© OpenStreetMap contributors (ODbL)";
const CACHE_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days
const AREA_ID = 3_600_000_000; // Overpass area id = 3.6e9 + relation id.

export class OsmError extends Error {
  constructor(
    message: string,
    readonly status = 502,
  ) {
    super(message);
  }
}

/** Full geometry for one area, kept server-side (in KV) for adjacency at create. */
interface StoredArea {
  id: string;
  name: string;
  centroid: LngLat;
  geometry: AreaGeometry; // full resolution
}

interface CacheIndex {
  adminLevel: number;
  attribution: string;
  ids: string[];
}

function cacheKeyFor(parentRelId: number, adminLevel: number): string {
  return `areas:R${parentRelId}:${adminLevel}`;
}

function geomKey(cacheKey: string, id: string): string {
  return `${cacheKey}:g:${id}`;
}

// ---------------- Nominatim search ----------------

export async function searchCity(env: Env, query: string): Promise<OsmSearchResult[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const cacheKey = `search:${q.toLowerCase()}`;
  const cached = await env.OSM_CACHE.get(cacheKey, "json");
  if (cached) return cached as OsmSearchResult[];

  const url = new URL(NOMINATIM);
  url.searchParams.set("q", q);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("extratags", "1");
  url.searchParams.set("limit", "12");
  url.searchParams.set("accept-language", "en");

  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
  });
  if (res.status === 429) throw new OsmError("OpenStreetMap search is rate-limited. Try again shortly.", 429);
  if (!res.ok) throw new OsmError(`Nominatim error (${res.status}).`);

  const raw = (await res.json()) as Array<Record<string, unknown>>;
  const results: OsmSearchResult[] = [];
  for (const item of raw) {
    const osmType = String(item.osm_type ?? "");
    if (osmType !== "relation") continue; // only boundary relations can be a parent area
    const extratags = (item.extratags as Record<string, unknown> | undefined) ?? {};
    const adminLevelRaw = extratags.admin_level;
    const adminLevel = adminLevelRaw != null ? Number(adminLevelRaw) : null;
    const bb = (item.boundingbox as string[] | undefined)?.map(Number);
    results.push({
      name: String(item.name ?? item.display_name ?? "Unknown"),
      displayName: String(item.display_name ?? ""),
      osmType: "R",
      osmId: Number(item.osm_id),
      adminLevel: Number.isFinite(adminLevel as number) ? (adminLevel as number) : null,
      boundingBox: bb && bb.length === 4 ? [bb[0], bb[1], bb[2], bb[3]] : [0, 0, 0, 0],
      center: [Number(item.lon), Number(item.lat)],
    });
  }
  await env.OSM_CACHE.put(cacheKey, JSON.stringify(results), {
    expirationTtl: 60 * 60 * 24,
  });
  return results;
}

// ---------------- Overpass child areas ----------------

/** [south, west, north, east] map viewport. */
export interface BoundingBox {
  s: number;
  w: number;
  n: number;
  e: number;
}

function parentQuery(parentRelId: number, adminLevel: number): string {
  return `[out:json][timeout:90];
area(${AREA_ID + parentRelId})->.searchArea;
relation[boundary=administrative][admin_level=${adminLevel}](area.searchArea);
out geom;`;
}

function boundsQuery(adminLevel: number, b: BoundingBox): string {
  // Overpass bounding-box filter order is (south, west, north, east).
  return `[out:json][timeout:90];
relation[boundary=administrative][admin_level=${adminLevel}](${b.s},${b.w},${b.n},${b.e});
out geom;`;
}

function cacheKeyForBounds(adminLevel: number, b: BoundingBox): string {
  const r = (n: number) => n.toFixed(3);
  return `bbox:${adminLevel}:${r(b.s)}_${r(b.w)}_${r(b.n)}_${r(b.e)}`;
}

function featureName(props: Record<string, unknown> | null | undefined): string {
  if (!props) return "Unnamed area";
  return String(
    props.name ?? props["name:en"] ?? props["official_name"] ?? props.ref ?? "Unnamed area",
  );
}

function normaliseId(rawId: string | number | undefined): string | null {
  if (rawId == null) return null;
  const s = String(rawId);
  const m = s.match(/(relation|way|node)\/(\d+)/);
  if (m) return `${m[1][0].toUpperCase()}${m[2]}`;
  if (/^\d+$/.test(s)) return `R${s}`;
  return null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Fetch an Overpass query, trying each mirror and retrying transient failures. */
async function fetchOverpass(query: string): Promise<unknown> {
  const body = `data=${encodeURIComponent(query)}`;
  let lastStatus = 0;
  for (let round = 0; round < 2; round++) {
    for (const endpoint of OVERPASS_ENDPOINTS) {
      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: {
            "User-Agent": USER_AGENT,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body,
        });
        if (res.ok) return await res.json();
        lastStatus = res.status;
        // 429/5xx are transient — try the next mirror.
        if (res.status !== 429 && res.status < 500) {
          throw new OsmError(`Overpass rejected the request (${res.status}).`);
        }
      } catch (e) {
        if (e instanceof OsmError) throw e;
        // network error — try the next mirror
      }
    }
    await sleep(700);
  }
  throw new OsmError(
    `OpenStreetMap is busy right now (${lastStatus || "no response"}). Please try again in a moment.`,
    503,
  );
}

async function fetchAndCache(
  env: Env,
  cacheKey: string,
  query: string,
  adminLevel: number,
  emptyMessage: string,
): Promise<StoredArea[]> {
  const json = await fetchOverpass(query);
  const fc = osmtogeojson(json);
  const areas: StoredArea[] = [];
  for (const f of fc.features) {
    if (!f.geometry) continue;
    if (f.geometry.type !== "Polygon" && f.geometry.type !== "MultiPolygon") continue;
    const id = normaliseId(f.id);
    if (!id || !id.startsWith("R")) continue; // areas come from relations
    const geometry: AreaGeometry = {
      type: f.geometry.type,
      coordinates: f.geometry.coordinates as AreaGeometry["coordinates"],
    };
    areas.push({
      id,
      name: featureName(f.properties),
      centroid: centroidOf(geometry),
      geometry,
    });
  }
  // De-duplicate by id (Overpass can emit a relation more than once).
  const byId = new Map<string, StoredArea>();
  for (const a of areas) if (!byId.has(a.id)) byId.set(a.id, a);
  const unique = [...byId.values()];

  if (unique.length === 0) throw new OsmError(emptyMessage, 404);

  // Cache each area's full geometry separately (keeps each KV value well under limits).
  const index: CacheIndex = {
    adminLevel,
    attribution: OSM_ATTRIBUTION,
    ids: unique.map((a) => a.id),
  };
  await env.OSM_CACHE.put(cacheKey, JSON.stringify(index), {
    expirationTtl: CACHE_TTL_SECONDS,
  });
  await Promise.all(
    unique.map((a) =>
      env.OSM_CACHE.put(geomKey(cacheKey, a.id), JSON.stringify(a), {
        expirationTtl: CACHE_TTL_SECONDS,
      }),
    ),
  );
  return unique;
}

async function loadCached(env: Env, cacheKey: string): Promise<StoredArea[] | null> {
  const index = (await env.OSM_CACHE.get(cacheKey, "json")) as CacheIndex | null;
  if (!index) return null;
  const loaded = await Promise.all(
    index.ids.map((id) => env.OSM_CACHE.get(geomKey(cacheKey, id), "json")),
  );
  const stored = loaded.filter(Boolean) as StoredArea[];
  // Some geometry entries expired — treat as a miss so we refetch consistently.
  if (stored.length !== index.ids.length) return null;
  return stored;
}

function buildResponse(
  cacheKey: string,
  adminLevel: number,
  stored: StoredArea[],
): OsmAreasResponse {
  const areas: OsmAreaFeature[] = stored.map((a) => ({
    id: a.id,
    name: a.name,
    centroid: a.centroid,
    geometry: simplifyGeometry(a.geometry), // simplified for the wizard map
  }));
  return { cacheKey, adminLevel, areas, attribution: OSM_ATTRIBUTION };
}

/** Child admin areas within a parent city/boundary. */
export async function getAreas(
  env: Env,
  parentRelId: number,
  adminLevel: number,
): Promise<OsmAreasResponse> {
  const cacheKey = cacheKeyFor(parentRelId, adminLevel);
  const stored =
    (await loadCached(env, cacheKey)) ??
    (await fetchAndCache(
      env,
      cacheKey,
      parentQuery(parentRelId, adminLevel),
      adminLevel,
      `No administrative areas at level ${adminLevel} were found inside that boundary.`,
    ));
  return buildResponse(cacheKey, adminLevel, stored);
}

/** Admin areas of a level within the current map viewport (may span cities). */
export async function getAreasInBounds(
  env: Env,
  adminLevel: number,
  bounds: BoundingBox,
): Promise<OsmAreasResponse> {
  const cacheKey = cacheKeyForBounds(adminLevel, bounds);
  const stored =
    (await loadCached(env, cacheKey)) ??
    (await fetchAndCache(
      env,
      cacheKey,
      boundsQuery(adminLevel, bounds),
      adminLevel,
      `No administrative areas at level ${adminLevel} were found in this map view.`,
    ));
  return buildResponse(cacheKey, adminLevel, stored);
}

/** Load FULL geometry for selected areas (used at lobby creation for adjacency). */
export async function loadFullAreas(
  env: Env,
  cacheKey: string,
  selectedIds: string[],
): Promise<StoredArea[]> {
  const loaded = await Promise.all(
    selectedIds.map((id) => env.OSM_CACHE.get(geomKey(cacheKey, id), "json")),
  );
  const areas = loaded.filter(Boolean) as StoredArea[];
  if (areas.length === 0) {
    throw new OsmError(
      "The map data for this game expired. Please reselect the areas.",
      410,
    );
  }
  return areas;
}
