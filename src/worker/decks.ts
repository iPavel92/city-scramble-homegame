import { defaultChallengePool } from "../shared/challenges.i18n";
import type { GameParams } from "../shared/types";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // no I/O to avoid confusion

export function generateCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  let code = "";
  for (let i = 0; i < 4; i++) code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return code;
}

export function generateToken(): string {
  return crypto.randomUUID();
}

/** Fisher–Yates shuffle (in place) using crypto randomness. */
export function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const r = crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;
    const j = Math.floor(r * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export interface DeckLayout {
  privateDecks: Record<string, string[]>;
  /** Open-deck areas currently in play (unclaimed). */
  flop: string[];
  /** Remaining open-deck areas, drawn from the front, returned to the back. */
  deck: string[];
  challenges: Record<string, string>;
}

/**
 * Partition selected areas into per-team private decks and a shared open deck,
 * then assign a challenge to every area. Throws if there aren't enough areas to
 * give each team its private deck plus at least one open-deck area.
 */
export function partition(
  areaIds: string[],
  teamIds: string[],
  params: GameParams,
  customChallenges?: Record<string, string>,
): DeckLayout {
  const Y = Math.max(0, Math.floor(params.privateDeckSize));
  const X = Math.max(1, Math.floor(params.openInPlay));
  // Each team needs its private deck (Y) plus a full opening flop (X). The
  // client gates Start on the same figure; this is the server-side backstop.
  const needed = teamIds.length * Y + X;
  if (areaIds.length < needed) {
    throw new Error(
      `Not enough areas: ${teamIds.length} team(s) with a private deck of ${Y} and an open flop of ${X} need at least ${needed}, but only ${areaIds.length} were selected.`,
    );
  }

  const pool = shuffle([...areaIds]);
  const privateDecks: Record<string, string[]> = {};
  for (const teamId of teamIds) {
    privateDecks[teamId] = pool.splice(0, Y);
  }
  const flop = pool.splice(0, X); // in play now
  const deck = pool; // remaining, drawn later

  // Assign a challenge to every area: use the host's custom text when provided,
  // otherwise cycle a shuffled copy of the built-in pool (which includes the
  // teammate challenges when the game is set to 2-player teams).
  const challenges: Record<string, string> = {};
  const shuffledChallenges = shuffle(
    defaultChallengePool(params.teamSize ?? 1, params.challengeLang ?? "en"),
  );
  let ci = 0;
  const assign = (id: string) => {
    const custom = customChallenges?.[id]?.trim();
    if (custom) {
      challenges[id] = custom;
      return;
    }
    challenges[id] = shuffledChallenges[ci % shuffledChallenges.length];
    ci++;
  };
  for (const teamId of teamIds) for (const id of privateDecks[teamId]) assign(id);
  for (const id of flop) assign(id);
  for (const id of deck) assign(id);

  return { privateDecks, flop, deck, challenges };
}
