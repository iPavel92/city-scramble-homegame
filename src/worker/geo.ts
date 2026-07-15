import { simplify } from "@turf/simplify";
import { feature } from "@turf/helpers";
import type { AreaGeometry, LngLat } from "../shared/types";

/** Douglas–Peucker simplification for RENDERING only (never for adjacency). */
export function simplifyGeometry(geom: AreaGeometry, tolerance = 0.0004): AreaGeometry {
  try {
    const f = feature(geom as never);
    const simplified = simplify(f, { tolerance, highQuality: false, mutate: false });
    const g = simplified.geometry as unknown as AreaGeometry;
    // Guard against degenerate output (simplify can collapse tiny polygons).
    if (!g || !g.coordinates || (g.coordinates as unknown[]).length === 0) return geom;
    return g;
  } catch {
    return geom;
  }
}

/** Representative point: average of the first outer ring's vertices. */
export function centroidOf(geom: AreaGeometry): LngLat {
  let ring: number[][] | undefined;
  if (geom.type === "Polygon") {
    ring = (geom.coordinates as number[][][])[0];
  } else {
    ring = (geom.coordinates as number[][][][])[0]?.[0];
  }
  if (!ring || ring.length === 0) return [0, 0];
  let x = 0;
  let y = 0;
  for (const p of ring) {
    x += p[0];
    y += p[1];
  }
  return [x / ring.length, y / ring.length];
}
