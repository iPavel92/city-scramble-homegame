import { describe, expect, it } from "vitest";
import { partition } from "./decks";

const params = {
  timeLimitMs: 3_600_000,
  privateDeckSize: 1,
  openInPlay: 2,
  privateUnlockPeriodMs: 0,
};

describe("partition custom challenges", () => {
  it("uses host-supplied text where provided and falls back to the pool", () => {
    const areaIds = ["A", "B", "C", "D"];
    const teamIds = ["t1", "t2"];
    const custom = { A: "Do a cartwheel", C: "Find a red door" };
    const layout = partition(areaIds, teamIds, params, custom);

    expect(layout.challenges["A"]).toBe("Do a cartwheel");
    expect(layout.challenges["C"]).toBe("Find a red door");
    // Every area still gets some challenge; B and D come from the pool.
    for (const id of areaIds) {
      expect(layout.challenges[id]).toBeTruthy();
    }
    expect(layout.challenges["B"]).not.toBe("Do a cartwheel");
  });

  it("ignores empty/whitespace overrides", () => {
    const layout = partition(["A", "B", "C"], ["t1"], params, { A: "   " });
    expect(layout.challenges["A"].trim().length).toBeGreaterThan(0);
  });
});
