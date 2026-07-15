import { CHALLENGES } from "../shared/challenges";
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
  openQueue: string[];
  revealedCount: number;
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
): DeckLayout {
  const Y = Math.max(0, Math.floor(params.privateDeckSize));
  const X = Math.max(1, Math.floor(params.openInPlay));
  const needed = teamIds.length * Y + 1;
  if (areaIds.length < needed) {
    throw new Error(
      `Not enough areas: need at least ${needed} for ${teamIds.length} team(s) with a private deck of ${Y}, but only ${areaIds.length} were selected.`,
    );
  }

  const pool = shuffle([...areaIds]);
  const privateDecks: Record<string, string[]> = {};
  for (const teamId of teamIds) {
    privateDecks[teamId] = pool.splice(0, Y);
  }
  const openQueue = pool; // remaining
  const revealedCount = Math.min(X, openQueue.length);

  // Assign a challenge to every area (cycling a shuffled pool if needed).
  const challenges: Record<string, string> = {};
  const shuffledChallenges = shuffle([...CHALLENGES]);
  let ci = 0;
  const assign = (id: string) => {
    challenges[id] = shuffledChallenges[ci % shuffledChallenges.length];
    ci++;
  };
  for (const teamId of teamIds) for (const id of privateDecks[teamId]) assign(id);
  for (const id of openQueue) assign(id);

  return { privateDecks, openQueue, revealedCount, challenges };
}
