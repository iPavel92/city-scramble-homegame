import type { Claim, ScoreEntry } from "./types";

/** Adjacency graph: area id -> list of neighbouring area ids (shared border). */
export type Adjacency = Record<string, string[]>;

/**
 * Size of the largest connected cluster among `claimed`, using `adjacency`.
 * Only edges where BOTH endpoints are in `claimed` count, so isolated claimed
 * areas contribute a cluster of size 1 (never combined with unclaimed areas).
 */
export function largestCluster(claimed: Set<string>, adjacency: Adjacency): number {
  const seen = new Set<string>();
  let best = 0;
  for (const start of claimed) {
    if (seen.has(start)) continue;
    // BFS over claimed-only subgraph.
    let size = 0;
    const stack = [start];
    seen.add(start);
    while (stack.length > 0) {
      const node = stack.pop()!;
      size++;
      const neighbours = adjacency[node] ?? [];
      for (const n of neighbours) {
        if (claimed.has(n) && !seen.has(n)) {
          seen.add(n);
          stack.push(n);
        }
      }
    }
    if (size > best) best = size;
  }
  return best;
}

/** Compute per-team scores from the claim list and adjacency graph. */
export function computeScores(
  teamIds: string[],
  claims: Claim[],
  adjacency: Adjacency,
): ScoreEntry[] {
  const claimedByTeam = new Map<string, Set<string>>();
  for (const id of teamIds) claimedByTeam.set(id, new Set());
  for (const c of claims) {
    const set = claimedByTeam.get(c.teamId);
    if (set) set.add(c.areaId);
  }
  return teamIds.map((teamId) => {
    const claimed = claimedByTeam.get(teamId)!;
    return {
      teamId,
      largestCluster: largestCluster(claimed, adjacency),
      totalClaimed: claimed.size,
    };
  });
}

/**
 * Determine winning team id(s). Primary: largest cluster. Tie-break: total
 * claimed. Remaining ties share the win. Empty when no areas were claimed.
 */
export function determineWinners(scores: ScoreEntry[]): string[] {
  const contenders = scores.filter((s) => s.largestCluster > 0);
  if (contenders.length === 0) return [];
  let best = contenders[0];
  for (const s of contenders) {
    if (
      s.largestCluster > best.largestCluster ||
      (s.largestCluster === best.largestCluster && s.totalClaimed > best.totalClaimed)
    ) {
      best = s;
    }
  }
  return contenders
    .filter(
      (s) =>
        s.largestCluster === best.largestCluster && s.totalClaimed === best.totalClaimed,
    )
    .map((s) => s.teamId);
}
