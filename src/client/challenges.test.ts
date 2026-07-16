import { describe, expect, it } from "vitest";
import { challengeTemplate, validateChallengeJson } from "./challenges";

const areas = [
  { id: "A", name: "North" },
  { id: "B", name: "South" },
  { id: "C", name: "East" },
];

const entry = (area: string, challenge: string) => ({ area, challenge });

describe("challengeTemplate", () => {
  it("emits one placeholder entry per area, matched by name", () => {
    const tpl = JSON.parse(challengeTemplate(areas));
    expect(tpl).toEqual([
      { area: "North", challenge: "challenge-text" },
      { area: "South", challenge: "challenge-text" },
      { area: "East", challenge: "challenge-text" },
    ]);
  });
});

describe("validateChallengeJson", () => {
  it("accepts one entry per area, matched by name", () => {
    const text = JSON.stringify([
      entry("North", "Do a cartwheel"),
      entry("South", "Find a red door"),
      entry("East", "Take a selfie"),
    ]);
    const res = validateChallengeJson(text, areas);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.map).toEqual({
        A: "Do a cartwheel",
        B: "Find a red door",
        C: "Take a selfie",
      });
    }
  });

  it("rejects non-JSON", () => {
    expect(validateChallengeJson("not json", areas).ok).toBe(false);
  });

  it("rejects a non-array payload", () => {
    expect(validateChallengeJson(JSON.stringify({ area: "North" }), areas)).toMatchObject({
      ok: false,
    });
  });

  it("allows missing areas and returns a partial map (they fall back to defaults)", () => {
    const text = JSON.stringify([entry("North", "x"), entry("South", "y")]);
    const res = validateChallengeJson(text, areas);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.map).toEqual({ A: "x", B: "y" });
  });

  it("rejects an import with no valid entries", () => {
    const res = validateChallengeJson("[]", areas);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("at least one");
  });

  it("rejects a duplicate area entry", () => {
    const text = JSON.stringify([
      entry("North", "x"),
      entry("South", "y"),
      entry("East", "z"),
      entry("North", "again"),
    ]);
    const res = validateChallengeJson(text, areas);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("more than once");
  });

  it("rejects an unknown area", () => {
    const text = JSON.stringify([
      entry("North", "x"),
      entry("South", "y"),
      entry("Nowhere", "z"),
    ]);
    const res = validateChallengeJson(text, areas);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("Nowhere");
  });

  it("rejects an empty challenge", () => {
    const text = JSON.stringify([
      entry("North", "  "),
      entry("South", "y"),
      entry("East", "z"),
    ]);
    const res = validateChallengeJson(text, areas);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("North");
  });

  it("rejects selections with duplicate area names", () => {
    const dupe = [
      { id: "A", name: "Center" },
      { id: "B", name: "Center" },
    ];
    const res = validateChallengeJson(JSON.stringify([entry("Center", "x")]), dupe);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("share a name");
  });
});
