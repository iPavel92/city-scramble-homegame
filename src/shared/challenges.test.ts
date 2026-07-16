import { describe, expect, it } from "vitest";
import { CHALLENGES, TEAMMATE_CHALLENGES, defaultChallengePool } from "./challenges";

describe("defaultChallengePool", () => {
  it("returns only the base pool for 1-player teams", () => {
    const pool = defaultChallengePool(1);
    expect(pool.length).toBe(CHALLENGES.length);
    for (const t of TEAMMATE_CHALLENGES) expect(pool).not.toContain(t);
  });

  it("adds teammate challenges for 2-player teams", () => {
    const pool = defaultChallengePool(2);
    expect(pool.length).toBe(CHALLENGES.length + TEAMMATE_CHALLENGES.length);
    expect(pool).toContain(TEAMMATE_CHALLENGES[0]);
    expect(pool).toContain(CHALLENGES[0]);
  });

  it("treats unknown/missing sizes as solo", () => {
    expect(defaultChallengePool(0).length).toBe(CHALLENGES.length);
  });
});
