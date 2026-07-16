import type { ScoreEntry, Team } from "../../shared/types";

export function Leaderboard({
  scores,
  teams,
  youTeamId,
}: {
  scores: ScoreEntry[];
  teams: Team[];
  youTeamId: string;
}) {
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const ranked = [...scores].sort(
    (a, b) => b.largestCluster - a.largestCluster || b.totalClaimed - a.totalClaimed,
  );

  return (
    <div className="leaderboard">
      <div className="lb-title">Score</div>
      {ranked.map((s) => {
        const team = teamById.get(s.teamId);
        if (!team) return null;
        return (
          <div key={s.teamId} className={`lb-row ${s.teamId === youTeamId ? "you" : ""}`}>
            <span className="dot" style={{ background: team.color }} />
            <span className="name">{team.name}</span>
            <span className="score">
              {s.largestCluster}
              <span style={{ color: "var(--text-dim)", fontWeight: 500 }}> ·{s.totalClaimed}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}
