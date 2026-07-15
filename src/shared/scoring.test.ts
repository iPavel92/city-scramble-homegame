import { describe, it, expect } from "vitest";
import { largestCluster, computeScores, determineWinners, type Adjacency } from "./scoring";

// Grid of 6 areas:  a - b - c
//                   |   |   |
//                   d - e - f
const grid: Adjacency = {
  a: ["b", "d"],
  b: ["a", "c", "e"],
  c: ["b", "f"],
  d: ["a", "e"],
  e: ["b", "d", "f"],
  f: ["c", "e"],
};

describe("largestCluster", () => {
  it("returns 0 with no claims", () => {
    expect(largestCluster(new Set(), grid)).toBe(0);
  });

  it("counts a single claimed area as a cluster of 1", () => {
    expect(largestCluster(new Set(["a"]), grid)).toBe(1);
  });

  it("joins adjacent claimed areas", () => {
    expect(largestCluster(new Set(["a", "b", "c"]), grid)).toBe(3);
  });

  it("does not join areas connected only through an unclaimed area", () => {
    // a and c are both adjacent to b, but b is not claimed.
    expect(largestCluster(new Set(["a", "c"]), grid)).toBe(1);
  });

  it("finds the largest of several disconnected clusters", () => {
    // {a,b,d} form a 3-cluster; {f} is isolated (c and e not claimed).
    expect(largestCluster(new Set(["a", "b", "d", "f"]), grid)).toBe(3);
  });
});

describe("computeScores + determineWinners", () => {
  it("scores by largest cluster and breaks ties by total claimed", () => {
    const now = 1;
    const claims = [
      { areaId: "a", teamId: "t1", at: now },
      { areaId: "b", teamId: "t1", at: now },
      { areaId: "c", teamId: "t2", at: now },
      { areaId: "f", teamId: "t2", at: now },
    ];
    const scores = computeScores(["t1", "t2"], claims, grid);
    const t1 = scores.find((s) => s.teamId === "t1")!;
    const t2 = scores.find((s) => s.teamId === "t2")!;
    expect(t1.largestCluster).toBe(2); // a-b adjacent
    expect(t2.largestCluster).toBe(2); // c-f adjacent
    // tie on cluster + total -> shared win
    expect(determineWinners(scores).sort()).toEqual(["t1", "t2"]);
  });

  it("no winners when nothing claimed", () => {
    const scores = computeScores(["t1", "t2"], [], grid);
    expect(determineWinners(scores)).toEqual([]);
  });
});
