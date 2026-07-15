import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { GameStateView, Team } from "../../shared/types";
import { MapView, type MapFeature } from "./MapView";
import { Timer } from "./Timer";
import { Leaderboard } from "./Leaderboard";
import { ChallengeSheet } from "./ChallengeSheet";

const GRAY = "#9ca3af";

export function GameView({
  state,
  offset,
  onClaim,
}: {
  state: GameStateView;
  offset: number;
  onClaim: (areaId: string) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);

  const teamById = useMemo(() => new Map(state.teams.map((t) => [t.id, t])), [state.teams]);
  const you = teamById.get(state.youTeamId);
  const placementById = useMemo(
    () => new Map(state.placements.map((p) => [p.areaId, p])),
    [state.placements],
  );

  const features: MapFeature[] = useMemo(
    () =>
      state.areas.map((area) => {
        const p = placementById.get(area.id)!;
        let style;
        if (p.claim) {
          const c = teamById.get(p.claim.teamId)?.color ?? GRAY;
          style = { color: c, weight: 2, fillColor: c, fillOpacity: 0.6 };
        } else if (p.deck === "open") {
          style = { color: "#cbd5e1", weight: 1.5, fillColor: GRAY, fillOpacity: 0.3 };
        } else {
          const c = you?.color ?? "#38bdf8";
          style = { color: c, weight: 1.5, fillColor: c, fillOpacity: 0.3, dashArray: "5,4" };
        }
        return {
          area,
          style,
          tooltip: area.name,
          onClick: p.claimable ? () => setSelected(area.id) : undefined,
        };
      }),
    [state.areas, placementById, teamById, you],
  );

  const selPlacement = selected ? placementById.get(selected) : null;
  const selArea = selected ? state.areas.find((a) => a.id === selected) : null;

  return (
    <div className="game-root">
      <MapView features={features} fitSignature={state.code} className="map fullscreen" />
      <div className="hud-top">
        {state.endsAt && <Timer endsAt={state.endsAt} offset={offset} />}
        <Leaderboard scores={state.scores} teams={state.teams} youTeamId={state.youTeamId} />
      </div>

      {selPlacement?.claimable && selArea && (
        <ChallengeSheet
          areaName={selArea.name}
          placement={selPlacement}
          onClose={() => setSelected(null)}
          onClaim={() => {
            onClaim(selArea.id);
            setSelected(null);
          }}
        />
      )}

      {state.phase === "ended" && <ResultsOverlay state={state} teamById={teamById} />}
    </div>
  );
}

function ResultsOverlay({
  state,
  teamById,
}: {
  state: GameStateView;
  teamById: Map<string, Team>;
}) {
  const navigate = useNavigate();
  const winners = (state.winnerTeamIds ?? []).map((id) => teamById.get(id)).filter(Boolean) as Team[];
  const ranked = [...state.scores].sort(
    (a, b) => b.largestCluster - a.largestCluster || b.totalClaimed - a.totalClaimed,
  );

  return (
    <div className="overlay">
      <div className="trophy">🏆</div>
      {winners.length === 0 ? (
        <h2>No areas were claimed</h2>
      ) : winners.length === 1 ? (
        <h2>
          <span className="dot" style={{ background: winners[0].color, display: "inline-block" }} />{" "}
          {winners[0].name} wins!
        </h2>
      ) : (
        <h2>It's a tie: {winners.map((w) => w.name).join(" & ")}</h2>
      )}
      <div className="card" style={{ width: "100%", maxWidth: 360 }}>
        {ranked.map((s) => {
          const t = teamById.get(s.teamId);
          if (!t) return null;
          return (
            <div className="lb-row" key={s.teamId}>
              <span className="dot" style={{ background: t.color }} />
              <span className="name">{t.name}</span>
              <span className="score">
                {s.largestCluster}
                <span style={{ color: "var(--text-dim)", fontWeight: 500 }}>
                  {" "}
                  · {s.totalClaimed} total
                </span>
              </span>
            </div>
          );
        })}
      </div>
      <p className="hint">Largest connected cluster wins · ties broken by total areas.</p>
      <button className="btn" style={{ maxWidth: 360 }} onClick={() => navigate("/")}>
        Back to home
      </button>
    </div>
  );
}
