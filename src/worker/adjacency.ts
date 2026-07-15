import { lineString } from "@turf/helpers";
import { lineOverlap } from "@turf/line-overlap";
import { length } from "@turf/length";
import type { AreaGeometry, LngLat } from "../shared/types";
import type { Adjacency } from "../shared/scoring";

/**
 * Compute the border-adjacency graph for a set of areas from FULL-RESOLUTION
 * geometry. Two areas are adjacent when they share a boundary edge.
 *
 * Primary method (exact, float-free): adjacent OSM admin areas reuse the same
 * boundary ways, so their boundary vertices are identical. We detect a shared
 * *edge* (two consecutive shared vertices) via canonical edge keys.
 *
 * Fallback (rare — boundaries digitised with different nodes): Turf line-overlap
 * length above a small threshold. Guarded by a bounding-box prefilter so cost
 * stays low even for ~200 areas.
 *
 * IMPORTANT: never run this on simplified geometry — independent simplification
 * breaks shared edges and corrupts the winner calculation.
 */
export interface AdjacencyInput {
  id: string;
  geometry: AreaGeometry;
}

type BBox = [number, number, number, number]; // [minX, minY, maxX, maxY]

const EDGE_PRECISION = 6; // ~0.11 m — enough to match identical OSM nodes.
const OVERLAP_TOLERANCE_KM = 0.01; // 10 m tolerance for the fallback.
const OVERLAP_MIN_KM = 0.02; // require ≥20 m of shared border in the fallback.

function ringsOf(geom: AreaGeometry): LngLat[][] {
  const rings: LngLat[][] = [];
  if (geom.type === "Polygon") {
    for (const ring of geom.coordinates as number[][][]) {
      rings.push(ring as LngLat[]);
    }
  } else {
    for (const poly of geom.coordinates as number[][][][]) {
      for (const ring of poly) rings.push(ring as LngLat[]);
    }
  }
  return rings;
}

function key(p: LngLat): string {
  return `${p[0].toFixed(EDGE_PRECISION)},${p[1].toFixed(EDGE_PRECISION)}`;
}

function edgeKey(a: LngLat, b: LngLat): string {
  const ka = key(a);
  const kb = key(b);
  return ka < kb ? `${ka}_${kb}` : `${kb}_${ka}`;
}

interface Prepared {
  id: string;
  bbox: BBox;
  edges: Set<string>;
  rings: LngLat[][];
}

function prepare(input: AdjacencyInput): Prepared {
  const rings = ringsOf(input.geometry);
  const edges = new Set<string>();
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const ring of rings) {
    for (let i = 0; i < ring.length; i++) {
      const p = ring[i];
      if (p[0] < minX) minX = p[0];
      if (p[0] > maxX) maxX = p[0];
      if (p[1] < minY) minY = p[1];
      if (p[1] > maxY) maxY = p[1];
      if (i > 0) edges.add(edgeKey(ring[i - 1], p));
    }
  }
  return { id: input.id, bbox: [minX, minY, maxX, maxY], edges, rings };
}

function bboxOverlap(a: BBox, b: BBox): boolean {
  return !(a[2] < b[0] || b[2] < a[0] || a[3] < b[1] || b[3] < a[1]);
}

function shareEdge(a: Prepared, b: Prepared): boolean {
  // Iterate the smaller set for speed.
  const [small, large] = a.edges.size <= b.edges.size ? [a, b] : [b, a];
  for (const e of small.edges) {
    if (large.edges.has(e)) return true;
  }
  return false;
}

function overlapFallback(a: Prepared, b: Prepared): boolean {
  let total = 0;
  for (const ra of a.rings) {
    if (ra.length < 2) continue;
    const la = lineString(ra as number[][]);
    for (const rb of b.rings) {
      if (rb.length < 2) continue;
      const lb = lineString(rb as number[][]);
      const overlap = lineOverlap(la, lb, { tolerance: OVERLAP_TOLERANCE_KM });
      for (const seg of overlap.features) {
        total += length(seg, { units: "kilometers" });
        if (total >= OVERLAP_MIN_KM) return true;
      }
    }
  }
  return false;
}

export function computeAdjacency(inputs: AdjacencyInput[]): Adjacency {
  const prepared = inputs.map(prepare);
  const adjacency: Adjacency = {};
  for (const p of prepared) adjacency[p.id] = [];

  for (let i = 0; i < prepared.length; i++) {
    for (let j = i + 1; j < prepared.length; j++) {
      const a = prepared[i];
      const b = prepared[j];
      if (!bboxOverlap(a.bbox, b.bbox)) continue;
      let adjacent = shareEdge(a, b);
      if (!adjacent) adjacent = overlapFallback(a, b);
      if (adjacent) {
        adjacency[a.id].push(b.id);
        adjacency[b.id].push(a.id);
      }
    }
  }
  return adjacency;
}
