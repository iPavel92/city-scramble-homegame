import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { GameStateView, Team } from "../../shared/types";
import { MapView, type MapFeature } from "./MapView";
import { Timer } from "./Timer";
import { Leaderboard } from "./Leaderboard";
import { ChallengeSheet } from "./ChallengeSheet";

const GRAY = "#9ca3af";
// Open-deck in-play fill: GRAY darkened by 30% so live open areas stand out.
const OPEN_FILL = "#6d727a";
const BORDER = "#000000";
const HIGHLIGHT = "#fbbf24";
const PROTECTED = "#a855f7"; // purple border for protected areas
const ACTION = "#38bdf8"; // accent border for tappable areas during a redraw

type AnnouncementKind = "claim" | "reveal" | "removed";

interface Announcement {
  id: string;
  areaId: string;
  kind: AnnouncementKind;
  message: string;
  color?: string; // team color, for claim announcements
}

interface Pending {
  type: "protect" | "replace";
  areaId: string;
}

const ANNOUNCE_TITLE: Record<AnnouncementKind, string> = {
  claim: "Area claimed",
  reveal: "New area in play",
  removed: "Area removed",
};

export function GameView({
  state,
  offset,
  onClaim,
  onProtect,
  onReplace,
}: {
  state: GameStateView;
  offset: number;
  onClaim: (areaId: string) => void;
  onProtect: (areaId: string) => void;
  onReplace: (areaId: string) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [queue, setQueue] = useState<Announcement[]>([]);
  const prevRef = useRef<{ claims: Map<string, string>; flop: Set<string>; init: boolean }>({
    claims: new Map(),
    flop: new Set(),
    init: false,
  });
  const seqRef = useRef(0);
  // Bumped on any claim/reveal/removal to refit the map to the whole game area.
  const [refitNonce, setRefitNonce] = useState(0);

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
  const redraw = state.redraw;

  // Derive claim / reveal / removed events by diffing consecutive states.
  useEffect(() => {
    const currClaims = new Map<string, string>();
    for (const p of state.placements) if (p.claim) currClaims.set(p.areaId, p.claim.teamId);
    const currFlop = new Set(state.flopAreaIds);
    const name = (id: string) => areaNameById.get(id) ?? "an area";

    const prev = prevRef.current;
    if (!prev.init) {
      prevRef.current = { claims: currClaims, flop: currFlop, init: true };
      return;
    }

    const next: Announcement[] = [];
    let boardChanged = false;
    for (const [areaId, teamId] of currClaims) {
      if (!prev.claims.has(areaId)) {
        boardChanged = true;
        if (teamId !== state.youTeamId) {
          const t = teamById.get(teamId);
          next.push({
            id: `c${seqRef.current++}`,
            areaId,
            kind: "claim",
            message: `${t?.name ?? "A team"} claimed ${name(areaId)}`,
            color: t?.color,
          });
        }
      }
    }
    // Left the flop without being claimed → returned to the deck (a replacement).
    for (const areaId of prev.flop) {
      if (!currFlop.has(areaId) && !currClaims.has(areaId)) {
        boardChanged = true;
        next.push({
          id: `x${seqRef.current++}`,
          areaId,
          kind: "removed",
          message: `${name(areaId)} was removed from play.`,
        });
      }
    }
    for (const areaId of currFlop) {
      if (!prev.flop.has(areaId)) {
        boardChanged = true;
        next.push({
          id: `r${seqRef.current++}`,
          areaId,
          kind: "reveal",
          message: `New area in play: ${name(areaId)}`,
        });
      }
    }

    prevRef.current = { claims: currClaims, flop: currFlop, init: true };
    if (next.length) setQueue((q) => [...q, ...next]);
    if (boardChanged) setRefitNonce((n) => n + 1);
  }, [state, teamById, areaNameById]);

  const dismissAnnouncement = () => setQueue((q) => q.slice(1));

  const current = queue[0] ?? null;
  const highlightId = current?.areaId ?? null;

  const actionable = useMemo(
    () => new Set(redraw?.actionableAreaIds ?? []),
    [redraw],
  );
  const protectedSet = useMemo(
    () => new Set(redraw?.protectedAreaIds ?? []),
    [redraw],
  );

  const features: MapFeature[] = useMemo(
    () =>
      state.areas.map((area) => {
        const p = placementById.get(area.id);
        let fillColor = BORDER;
        let fillOpacity = 0;
        if (p?.claim) {
          fillColor = teamById.get(p.claim.teamId)?.color ?? GRAY;
          fillOpacity = 0.6;
        } else if (p?.deck === "open") {
          fillColor = OPEN_FILL;
          fillOpacity = 0.4;
        } else if (p?.deck === "private") {
          fillColor = you?.color ?? "#38bdf8";
          fillOpacity = 0.3;
        }

        const isHi = area.id === highlightId;
        const isProtected = protectedSet.has(area.id);
        const isActionable = actionable.has(area.id);
        let color = BORDER;
        let weight = 1.5;
        if (isHi) {
          color = HIGHLIGHT;
          weight = 4;
        } else if (isProtected) {
          color = PROTECTED;
          weight = 4;
        } else if (isActionable) {
          color = ACTION;
          weight = 3;
        }

        let onClick: (() => void) | undefined;
        if (redraw) {
          if (isActionable) {
            const type = redraw.youRole === "claimer" ? "replace" : "protect";
            onClick = () => setPending({ type, areaId: area.id });
          }
        } else if (p?.claimable) {
          onClick = () => setSelected(area.id);
        }

        return {
          area,
          style: {
            color,
            weight,
            fillColor,
            // Highlighting only boosts an already-filled area; outline-only areas
            // (e.g. one just removed from play) get a border highlight, no fill.
            fillOpacity: isHi && fillOpacity > 0 ? Math.min(0.8, fillOpacity + 0.2) : fillOpacity,
          },
          tooltip: isProtected ? `🛡 ${area.name} (protected)` : area.name,
          onClick,
        };
      }),
    [state.areas, placementById, teamById, you, highlightId, redraw, actionable, protectedSet],
  );

  const selPlacement = selected ? placementById.get(selected) : null;
  const selArea = selected ? state.areas.find((a) => a.id === selected) : null;
  const pendingArea = pending ? state.areas.find((a) => a.id === pending.areaId) : null;

  const banner = redrawBanner(redraw, teamById);

  return (
    <div className="game-root">
      <MapView
        features={features}
        fitSignature={state.code}
        className="map fullscreen"
        refitNonce={refitNonce}
      />
      <div className="hud-top">
        <div className="hud-right">
          {state.endsAt && <Timer endsAt={state.endsAt} offset={offset} />}
          <Leaderboard scores={state.scores} teams={state.teams} youTeamId={state.youTeamId} />
        </div>
      </div>

      {banner && !current && !pending && <div className="redraw-banner">{banner}</div>}

      {/* Claim a normal area */}
      {selPlacement?.claimable && selArea && !current && !redraw && (
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

      {/* Protect / replace confirmation */}
      {pending && pendingArea && !current && (
        <div className="sheet-backdrop">
          <div className="sheet">
            <h3 style={{ margin: 0 }}>
              {pending.type === "protect" ? "Protect area" : "Replace area"}
            </h3>
            <div className="challenge">
              {pending.type === "protect"
                ? `Protect ${pendingArea.name}? Other teams won't be able to remove it.`
                : `Send ${pendingArea.name} back to the deck and draw a new area?`}
            </div>
            <div className="btn-row">
              <button className="btn ghost" onClick={() => setPending(null)}>
                Cancel
              </button>
              <button
                className="btn"
                onClick={() => {
                  if (pending.type === "protect") onProtect(pending.areaId);
                  else onReplace(pending.areaId);
                  setPending(null);
                }}
              >
                {pending.type === "protect" ? "Protect" : "Replace"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Claim / reveal / removed announcements (blocking, one at a time) */}
      {current && (
        <div className="sheet-backdrop">
          <div className="sheet" key={current.id}>
            <div className="row-between">
              <h3 style={{ margin: 0 }}>{ANNOUNCE_TITLE[current.kind]}</h3>
              {current.color && <span className="dot" style={{ background: current.color }} />}
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

function redrawBanner(
  redraw: GameStateView["redraw"],
  teamById: Map<string, Team>,
): string | null {
  if (!redraw) return null;
  const claimerName = teamById.get(redraw.claimerTeamId)?.name ?? "the leader";
  if (redraw.youRole === "protector") return "Tap an area on the map to protect it.";
  if (redraw.youRole === "claimer") return "Tap an unprotected area to replace it.";
  // waiting
  if (redraw.stage === "protecting") {
    return `Waiting for teams to protect… (${redraw.pendingCount} left)`;
  }
  return `Waiting for ${claimerName} to replace an area…`;
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
