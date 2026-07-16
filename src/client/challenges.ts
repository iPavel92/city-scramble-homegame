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

// Prompt handed to an external LLM to generate location-specific challenges.
// <AREAS_LIST> and <LANGUAGE> are filled in by buildAiPrompt.
const AI_PROMPT_TEMPLATE = `Task: Generate Location-Based Themed Challenges for a Home City Game
You generate challenges for a Jet Lag–style scavenger game. Given one or more geographic areas (OSM area names, optionally with a coordinate polygon), produce one challenge per area that a single player can complete, anchored to a real, verifiable landmark that lies strictly inside the area's polygon.
Input
<AREAS_LIST>
Each area has:

area: the OSM display name (e.g., "Београд (Палилула)"). Use the OSM administrative boundary. Before writing a challenge, identify what actually makes this specific area distinct — its history, who lived or died there, what was built or destroyed there, what it's locally known for, an odd fact, a former use of a building, a legend, an industry, an event. The challenge should only make sense here and nowhere else.
The bar for creativity (read this first)
Most generated challenges fail by being generic. Do NOT produce:

"Take a photo at/of [landmark]" as the whole task. A photo can be the evidence, but the task itself must be an action, not the photographing.
"Sketch/paint the view," "estimate the height/steps," "identify N plants," "recreate the statue's pose," "skip a stone" — these are worn-out templates. Use them only as a last resort, and never more than rarely across a batch.
Anything that would read identically if you swapped in a different city's landmark.

Instead, aim for challenges that are rooted in the specific place's history, culture, or character. Good directions to mine:

Historical reenactment or homage: do a small thing tied to what happened here (e.g., if a square hosted a famous market, barter for an item there; if an inventor worked here, perform a tiny demonstration of their invention).
Local product / cuisine / craft: obtain and consume/use something specifically produced, invented, or associated with this exact place — not the country generally.
Language, name, and etymology: tasks built on the area's name origin, a local dialect word, an inscription, a plaque's text, a street named after someone.
Numbers and dates hidden in the place: a founding year, a commemorated date, a house number, the count of something distinctive there — used to trigger a small action (not just "estimate and verify").
Sensory / observational specifics: find the specific detail only locals notice — a particular carving, a bullet hole, a boundary stone, a plaque, a mismatched brick, a specific grave.
Small performative or ritual acts tied to a legend or tradition associated with the landmark.
Micro-quests that send the player to do something a historical figure or local custom would have done at that exact spot.

Reward specificity. A challenge that requires the player to actually learn or engage with why the place matters is better than one that just uses the landmark as a backdrop.
Hard criteria (every challenge must satisfy ALL)
If no challenge can satisfy all of these for an area, omit the area entirely — no placeholder, null, or empty entry.

Single-player. One person, alone, start to finish. No teammate roles.
Retriable on failure. A failed attempt can be retried — after a time penalty, elsewhere, or with another try. No permanent one-shot auto-fail; no destroy-only tasks.
No physical playing card. Never requires holding, burning, mailing, or cutting with a game card.
No opposing-team action. No chasers, opponents, or "the other team confirms."
No audience/stranger dependency. Success must not hinge on a stranger, passerby, server, driver, or online crowd choosing to act. Ordinary transactions (buying a ticket, paying a vendor, being served) are fine; a stranger's discretionary cooperation is not.
One single verifiable result. Resolves to exactly one clear, checkable outcome — an object obtained, a measurable done, a specific thing located and evidenced, a defined act performed. No multi-step chains ("do A then B then C"), no vague states ("have a good time"). A verifier looks at one piece of evidence and rules pass/fail.
Landmark-specific, strictly inside the polygon. Must reference a specific, named, real landmark you are confident lies strictly inside the boundary. No "any park" / "nearest café." If unsure a suitable landmark exists inside, omit the area.

Balancing creativity against verifiability
Criterion 6 and the creativity push can pull against each other — resolve it by making the creative act itself the single verifiable result. E.g., "obtain [specific local pastry X, invented in this district] from [named bakery/market inside area] and eat it" is both creative and cleanly verifiable. Don't let a fear of un-verifiability collapse everything back into "take a photo." If a rich historical action can be evidenced by one photo or one obtained object, that's a strong challenge, not a photo challenge.
Formatting each challenge

One to three sentences.
Name the specific landmark explicitly.
Include quantities, thresholds, distances, time limits, and pass conditions needed to make the single result verifiable.
Imperial units with rounded metric in brackets: 50 ft [15 m].
Where the challenge draws on a historical/local fact, weave that fact briefly into the text so the player understands why — but keep it a single action, not a lecture.

Variety across the batch
Across all areas in one run, actively vary the challenge type. Do not let more than a small fraction share the same underlying mechanic. If you notice you've written three "obtain and eat a local food" tasks in a row, switch to a different modality (etymology, reenactment, observational find, ritual act, number-hunt, etc.) for the next.
Output
Return only a JSON array — no prose, no code fences:
json[
  {
    "area": "area",
    "challenge": "challenge-text"
  },
]

area exactly matches the input string.
Exactly one object per qualifying area; non-qualifying areas absent.
Preserve input order.
Challenge language: <LANGUAGE>
Valid, parseable JSON — no trailing commas, no comments, no surrounding text.

Before emitting each challenge, silently self-check:

Is this action specific to this place's history/culture/character, or could it be copy-pasted to any city? (If the latter, rewrite.)
Is the core task something other than "photograph the landmark"?
Does it pass all 7 hard criteria?
Is the landmark strictly inside the polygon, and am I confident it's real?

Only emit challenges that clear all four.`;

/**
 * Build the ready-to-paste AI prompt for generating location-specific
 * challenges. The areas list is the same JSON as the copy template; the
 * language is hard-coded to EN for now.
 */
export function buildAiPrompt(areas: { name: string }[], language = "EN"): string {
  const areasJson = challengeTemplate(areas);
  return AI_PROMPT_TEMPLATE.replace("<AREAS_LIST>", () => areasJson).replace(
    "<LANGUAGE>",
    () => language,
  );
}
