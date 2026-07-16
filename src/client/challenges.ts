/**
 * Validate host-pasted challenge JSON against the currently selected areas.
 * Expects an array of { area, challenge } objects matched by area name.
 * Areas may be left out — those fall back to random default challenges at game
 * start — but each area may appear at most once, must be one of the selected
 * areas, and must have non-empty text. Returns a map of areaId → challenge text
 * for the areas that were provided.
 */
export function validateChallengeJson(
  text: string,
  areas: { id: string; name: string }[],
): { ok: true; map: Record<string, string> } | { ok: false; error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return {
      ok: false,
      error: "That's not valid JSON. Copy the template, fill in each challenge, and paste it back.",
    };
  }
  if (!Array.isArray(parsed)) {
    return { ok: false, error: 'The JSON must be an array of { "area", "challenge" } objects.' };
  }

  // Matching is by name, so the selected areas must have unique names.
  const nameToId = new Map<string, string>();
  const dupeNames = new Set<string>();
  for (const a of areas) {
    if (nameToId.has(a.name)) dupeNames.add(a.name);
    nameToId.set(a.name, a.id);
  }
  if (dupeNames.size > 0) {
    return {
      ok: false,
      error: `Some selected areas share a name (e.g. "${[...dupeNames][0]}"), so challenges can't be matched by name.`,
    };
  }

  const map: Record<string, string> = {};
  const seen = new Set<string>();
  for (let i = 0; i < parsed.length; i++) {
    const item = parsed[i] as { area?: unknown; challenge?: unknown };
    const area = typeof item?.area === "string" ? item.area.trim() : "";
    const challenge = typeof item?.challenge === "string" ? item.challenge.trim() : "";
    if (!area) return { ok: false, error: `Entry ${i + 1} is missing an "area" name.` };
    if (!challenge) return { ok: false, error: `The entry for "${area}" has an empty challenge.` };
    const id = nameToId.get(area);
    if (!id) return { ok: false, error: `"${area}" isn't one of the selected areas.` };
    if (seen.has(id)) return { ok: false, error: `"${area}" appears more than once.` };
    seen.add(id);
    map[id] = challenge;
  }

  if (Object.keys(map).length === 0) {
    return {
      ok: false,
      error: "Add a challenge for at least one area, or switch to default challenges.",
    };
  }

  return { ok: true, map };
}

/** Build the copy-to-clipboard template for the selected areas. */
export function challengeTemplate(areas: { name: string }[]): string {
  return JSON.stringify(
    areas.map((a) => ({ area: a.name, challenge: "challenge-text" })),
    null,
    2,
  );
}
