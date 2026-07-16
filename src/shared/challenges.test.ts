import { describe, expect, it } from "vitest";
import { CHALLENGES, TEAMMATE_CHALLENGES } from "./challenges";
import {
  CHALLENGES_BY_LANG,
  TEAMMATE_BY_LANG,
  defaultChallengePool,
} from "./challenges.i18n";
import { LANGS } from "./i18n";

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

  it("returns the requested language's pool", () => {
    const de = defaultChallengePool(2, "de");
    expect(de).toContain(CHALLENGES_BY_LANG.de[0]);
    expect(de).toContain(TEAMMATE_BY_LANG.de[0]);
    expect(de).not.toContain(CHALLENGES[0]);
  });
});

describe("challenge translations", () => {
  it("every language has the full base + teammate pools", () => {
    for (const { code } of LANGS) {
      expect(CHALLENGES_BY_LANG[code].length).toBe(CHALLENGES.length);
      expect(TEAMMATE_BY_LANG[code].length).toBe(TEAMMATE_CHALLENGES.length);
      for (const c of [...CHALLENGES_BY_LANG[code], ...TEAMMATE_BY_LANG[code]]) {
        expect(c.trim().length).toBeGreaterThan(0);
      }
    }
  });
});
