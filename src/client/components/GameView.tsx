import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { GameStateView, Team } from "../../shared/types";
import { MapView, type MapFeature } from "./MapView";
import { Timer } from "./Timer";
import { Leaderboard } from "./Leaderboard";
import { ChallengeSheet } from "./ChallengeSheet";

const GRAY = "#9ca3af";
const BORDER = "#000000";
const HIGHLIGHT = "#fbbf24";

interface Announcement {
  id: string;
  areaId: string;
  message: string;
  /** Team color for a claim announcement (undefined for a reveal). */
  color?: string;
}

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
  const [queue, setQueue] = useState<Announcement[]>([]);
  const prevRef = useRef<{ claims: Map<string, string>; open: Set<string>; init: boolean }>({
    claims: new Map(),
    open: new Set(),
    init: false,
  });
  const seqRef = useRef(0);

  const teamById = useMemo(() => new Map(state.teams.map((t) => [t.id, t])), [state.teams]);
  const you = teamById.get(state.youTeamId);
  const placementById = useMemo(
    () => new Map(state.placements.map((p) => [p.areaId, p])),
    [state.placements],
  );
  const areaNameById = useMemo(
    () => new Map(state.areas.map((a) => [a.id, a.name])),
    [state.areas],
  );

  // Derive "claimed" / "new area in play" events by diffing consecutive states.
  useEffect(() => {
    const currClaims = new Map<string, string>();
    const currOpen = new Set<string>();
    for (const p of state.placements) {
      if (p.claim) currClaims.set(p.areaId, p.claim.teamId);
      else if (p.deck === "open" && p.claimable) currOpen.add(p.areaId);
    }

    const prev = prevRef.current;
    if (!prev.init) {
      // First snapshot is the baseline — don't announce the initial board.
      prevRef.current = { claims: currClaims, open: currOpen, init: true };
      return;
    }

    const next: Announcement[] = [];
    // Newly claimed areas (shown to everyone except the team that claimed it).
    for (const [areaId, teamId] of currClaims) {
      if (!prev.claims.has(areaId) && teamId !== state.youTeamId) {
        const t = teamById.get(teamId);
        next.push({
          id: `c${seqRef.current++}`,
          areaId,
          message: `${t?.name ?? "A team"} claimed ${areaNameById.get(areaId) ?? "an area"}`,
          color: t?.color,
        });
      }
    }
    // Newly revealed open-deck areas (shown to all teams).
    for (const areaId of currOpen) {
      if (!prev.open.has(areaId)) {
        next.push({
          id: `r${seqRef.current++}`,
          areaId,
          message: `New area in play: ${areaNameById.get(areaId) ?? "unknown"}`,
        });
      }
    }

    prevRef.current = { claims: currClaims, open: currOpen, init: true };
    if (next.length) setQueue((q) => [...q, ...next]);
  }, [state, teamById, areaNameById]);

  // Announcements are blocking — dismissed one at a time via the OK button.
  const dismissAnnouncement = () => setQueue((q) => q.slice(1));

  const current = queue[0] ?? null;
  const highlightId = current?.areaId ?? null;

  const features: MapFeature[] = useMemo(
    () =>
      state.areas.map((area) => {
        const p = placementById.get(area.id);
        // Areas not in play for this team render as black outlines only.
        let fillColor = BORDER;
        let fillOpacity = 0;
        if (p?.claim) {
          fillColor = teamById.get(p.claim.teamId)?.color ?? GRAY;
          fillOpacity = 0.6;
        } else if (p?.deck === "open") {
          fillColor = GRAY;
          fillOpacity = 0.4;
        } else if (p?.deck === "private") {
          fillColor = you?.color ?? "#38bdf8";
          fillOpacity = 0.3;
        }
        const isHi = area.id === highlightId;
        return {
          area,
          style: {
            color: isHi ? HIGHLIGHT : BORDER,
            weight: isHi ? 4 : 1.5,
            fillColor,
            fillOpacity: isHi ? Math.min(0.8, fillOpacity + 0.2) : fillOpacity,
          },
          tooltip: area.name,
          onClick: p?.claimable ? () => setSelected(area.id) : undefined,
        };
      }),
    [state.areas, placementById, teamById, you, highlightId],
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

      {selPlacement?.claimable && selArea && !current && (
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

      {current && (
        <div className="sheet-backdrop">
          <div className="sheet" key={current.id}>
            <div className="row-between">
              <h3 style={{ margin: 0 }}>
                {current.color ? "Area claimed" : "New area in play"}
              </h3>
              {current.color && (
                <span className="dot" style={{ background: current.color }} />
              )}
            </div>
            <div className="challenge">{current.message}</div>
            <button className="btn" onClick={dismissAnnouncement}>
              OK
            </button>
          </div>
        </div>
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
  const winners = (state.winnerTeamIds ?? [])
    .map((id) => teamById.get(id))
    .filter(Boolean) as Team[];
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
          <span
            className="dot"
            style={{ background: winners[0].color, display: "inline-block" }}
          />{" "}
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
