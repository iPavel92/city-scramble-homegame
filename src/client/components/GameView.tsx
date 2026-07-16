import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { GameStateView, Team } from "../../shared/types";
import { MapView, type MapFeature } from "./MapView";
import { Timer } from "./Timer";
import { Leaderboard } from "./Leaderboard";
import { ChallengeSheet } from "./ChallengeSheet";

const GRAY = "#9ca3af"; // fallback fill for a claimed area with an unknown team
const OPEN_FILL = "#4c5055"; // open-deck in-play fill (darkened toward black)
const BORDER = "#000000"; // border for actual in-game areas
const OUTLINE_BORDER = "#444444"; // gray border for non-in-game areas
const HIGHLIGHT = "#fbbf24"; // announcement highlight
const PROTECTED_FILL = "#1e2022"; // protected-area fill during a redraw (darkened)
const SELECTED_BORDER = "#f97316"; // bright orange border for the chosen option

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
  const prevRef = useRef<{
    claims: Map<string, string>;
    flop: Set<string>;
    mine: Set<string>;
    init: boolean;
  }>({
    claims: new Map(),
    flop: new Set(),
    mine: new Set(),
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
    const currMine = new Set<string>();
    for (const p of state.placements) {
      if (p.claim) currClaims.set(p.areaId, p.claim.teamId);
      else if (p.deck === "private") currMine.add(p.areaId); // my unlocked private areas
    }
    const currFlop = new Set(state.flopAreaIds);
    const name = (id: string) => areaNameById.get(id) ?? "an area";

    const prev = prevRef.current;
    if (!prev.init) {
      prevRef.current = { claims: currClaims, flop: currFlop, mine: currMine, init: true };
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
    // A private area of mine just unlocked onto the map.
    for (const areaId of currMine) {
      if (!prev.mine.has(areaId)) {
        boardChanged = true;
        next.push({
          id: `p${seqRef.current++}`,
          areaId,
          kind: "reveal",
          message: `New area in play: ${name(areaId)}`,
        });
      }
    }

    prevRef.current = { claims: currClaims, flop: currFlop, mine: currMine, init: true };
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

  const chosenId = pending?.areaId ?? null;

  const features: MapFeature[] = useMemo(
    () =>
      state.areas.map((area) => {
        const p = placementById.get(area.id);
        const isProtected = protectedSet.has(area.id);
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
        // Protected areas get a darkened fill while a redraw is in progress.
        if (redraw && isProtected) {
          fillColor = PROTECTED_FILL;
          fillOpacity = 0.6;
        }

        const isHi = area.id === highlightId;
        const isActionable = actionable.has(area.id);
        const isChosen = area.id === chosenId;
        let color: string;
        let weight: number;
        if (isHi) {
          color = HIGHLIGHT;
          weight = 4;
        } else if (redraw && isChosen) {
          color = SELECTED_BORDER; // the option the player has selected
          weight = 4;
        } else {
          // In-game areas (incl. protect/replace options) keep a black border;
          // everything else is gray.
          color = p ? BORDER : OUTLINE_BORDER;
          weight = 1.5;
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
    [state.areas, placementById, teamById, you, highlightId, redraw, actionable, protectedSet, chosenId],
  );

  const selPlacement = selected ? placementById.get(selected) : null;
  const selArea = selected ? state.areas.find((a) => a.id === selected) : null;
  const pendingArea = pending ? state.areas.find((a) => a.id === pending.areaId) : null;

  const banner = redrawBanner(redraw, teamById, state.youTeamId);

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
          {state.nextPrivateUnlockAt && (
            <Timer
              endsAt={state.nextPrivateUnlockAt}
              offset={offset}
              label="Next area"
              small
            />
          )}
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
                ? `Protect ${pendingArea.name}? The scored team won't be able to remove it.`
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
  youTeamId: string,
): string | null {
  if (!redraw) return null;
  const claimerName = teamById.get(redraw.claimerTeamId)?.name ?? "the leader";
  if (redraw.youRole === "protector")
    return "The scored team can remove one gray open-deck area from the map.\nTap one to protect it.";
  if (redraw.youRole === "claimer") return "Tap an unprotected gray area to replace it.";
  // waiting
  if (redraw.stage === "protecting") {
    if (youTeamId === redraw.claimerTeamId) {
      return "Now you can replace one open deck area in the flop.\nWaiting for other teams to protect their areas.";
    }
    return "Waiting for other teams to protect their areas.";
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
