import { describe, it, expect } from "vitest";
import { computeAdjacency, type AdjacencyInput } from "./adjacency";
import type { AreaGeometry } from "../shared/types";

function square(x: number, y: number, s = 1): AreaGeometry {
  return {
    type: "Polygon",
    coordinates: [
      [
        [x, y],
        [x + s, y],
        [x + s, y + s],
        [x, y + s],
        [x, y],
      ],
    ],
  };
}

describe("computeAdjacency", () => {
  it("links areas that share a full edge, not corner-touches or far areas", () => {
    const inputs: AdjacencyInput[] = [
      { id: "A", geometry: square(0, 0) }, // right edge x=1 shared with B
      { id: "B", geometry: square(1, 0) },
      { id: "D", geometry: square(2, 1) }, // touches B only at corner (2,1)
      { id: "C", geometry: square(10, 10) }, // isolated
    ];
    const adj = computeAdjacency(inputs);
    expect(adj.A.sort()).toEqual(["B"]);
    expect(adj.B.sort()).toEqual(["A"]);
    expect(adj.D).toEqual([]); // corner touch is not adjacency
    expect(adj.C).toEqual([]);
  });

  it("is symmetric across a shared edge", () => {
    const adj = computeAdjacency([
      { id: "L", geometry: square(0, 0) },
      { id: "R", geometry: square(1, 0) },
    ]);
    expect(adj.L).toContain("R");
    expect(adj.R).toContain("L");
  });
});
