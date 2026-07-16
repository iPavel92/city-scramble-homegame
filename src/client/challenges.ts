/**
 * Validate host-pasted challenge JSON against the currently selected areas.
 * Expects an array of { area, challenge } objects, one per selected area,
 * matched by area name. Every area must be covered exactly once — nothing
 * missing, nothing duplicated. Returns a map of areaId → challenge text.
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

  const missing = areas.filter((a) => !seen.has(a.id)).map((a) => a.name);
  if (missing.length > 0) {
    const shown = missing.slice(0, 3).join(", ");
    const extra = missing.length > 3 ? ` (+${missing.length - 3} more)` : "";
    return { ok: false, error: `Missing a challenge for: ${shown}${extra}.` };
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
