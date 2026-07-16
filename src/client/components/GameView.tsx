import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { GameStateView, Team } from "../../shared/types";
import { MapView, type MapFeature } from "./MapView";
import { Timer } from "./Timer";
import { Leaderboard } from "./Leaderboard";
import { ChallengeSheet } from "./ChallengeSheet";
import { useI18n, type TranslateFn } from "../i18n";
import type { TKey } from "../i18n/en";

const GRAY = "#9ca3af"; // fallback fill for a claimed area with an unknown team
const OPEN_FILL = "#4c5055"; // open-deck in-play fill (darkened toward black)
const BORDER = "#000000"; // border for actual in-game areas
const OUTLINE_BORDER = "#444444"; // gray border for non-in-game areas
const HIGHLIGHT = "#fbbf24"; // announcement highlight
const PROTECTED_FILL = "#1e2022"; // protected-area fill during a redraw (darkened)
const SELECTED_BORDER = "#38bdf8"; // neon blue (accent) border for the chosen option

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

const ANNOUNCE_KEY: Record<AnnouncementKind, TKey> = {
  claim: "announceClaim",
  reveal: "announceReveal",
  removed: "announceRemoved",
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
  const { t } = useI18n();
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
    const name = (id: string) => areaNameById.get(id) ?? t("fallbackArea");

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
          const team = teamById.get(teamId);
          next.push({
            id: `c${seqRef.current++}`,
            areaId,
            kind: "claim",
            message: t("msgTeamClaimed", {
              team: team?.name ?? t("fallbackTeam"),
              area: name(areaId),
            }),
            color: team?.color,
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
          message: t("msgAreaRemoved", { area: name(areaId) }),
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
          message: t("msgNewAreaInPlay", { area: name(areaId) }),
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
          message: t("msgNewAreaInPlay", { area: name(areaId) }),
        });
      }
    }

    prevRef.current = { claims: currClaims, flop: currFlop, mine: currMine, init: true };
    if (next.length) setQueue((q) => [...q, ...next]);
    if (boardChanged) setRefitNonce((n) => n + 1);
  }, [state, teamById, areaNameById, t]);

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

  const banner = redrawBanner(redraw, teamById, state.youTeamId, t);

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
              label={t("nextAreaLabel")}
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
              {pending.type === "protect" ? t("protectAreaTitle") : t("replaceAreaTitle")}
            </h3>
            <div className="challenge">
              {pending.type === "protect"
                ? t("protectConfirm", { area: pendingArea.name })
                : t("replaceConfirm", { area: pendingArea.name })}
            </div>
            <div className="btn-row">
              <button className="btn ghost" onClick={() => setPending(null)}>
                {t("cancel")}
              </button>
              <button
                className="btn"
                onClick={() => {
                  if (pending.type === "protect") onProtect(pending.areaId);
                  else onReplace(pending.areaId);
                  setPending(null);
                }}
              >
                {pending.type === "protect" ? t("protect") : t("replace")}
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
              <h3 style={{ margin: 0 }}>{t(ANNOUNCE_KEY[current.kind])}</h3>
              {current.color && <span className="dot" style={{ background: current.color }} />}
            </div>
            <div className="challenge">{current.message}</div>
            <button className="btn" onClick={dismissAnnouncement}>
              {t("ok")}
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
  t: TranslateFn,
): string | null {
  if (!redraw) return null;
  const claimerName = teamById.get(redraw.claimerTeamId)?.name ?? t("fallbackLeader");
  if (redraw.youRole === "protector") return t("bannerProtector");
  if (redraw.youRole === "claimer") return t("bannerClaimer");
  // waiting
  if (redraw.stage === "protecting") {
    if (youTeamId === redraw.claimerTeamId) return t("bannerClaimerWaiting");
    return t("bannerProtectorWaiting");
  }
  return t("bannerWaitingForClaimer", { name: claimerName });
}

function ResultsOverlay({
  state,
  teamById,
}: {
  state: GameStateView;
  teamById: Map<string, Team>;
}) {
  const navigate = useNavigate();
  const { t } = useI18n();
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
        <h2>{t("noAreasClaimed")}</h2>
      ) : winners.length === 1 ? (
        <h2>
          <span
            className="dot"
            style={{ background: winners[0].color, display: "inline-block" }}
          />{" "}
          {t("teamWins", { team: winners[0].name })}
        </h2>
      ) : (
        <h2>{t("itsATie", { names: winners.map((w) => w.name).join(" & ") })}</h2>
      )}
      <div className="card" style={{ width: "100%", maxWidth: 360 }}>
        {ranked.map((s) => {
          const team = teamById.get(s.teamId);
          if (!team) return null;
          return (
            <div className="lb-row" key={s.teamId}>
              <span className="dot" style={{ background: team.color }} />
              <span className="name">{team.name}</span>
              <span className="score">
                {s.largestCluster}
                <span style={{ color: "var(--text-dim)", fontWeight: 500 }}>
                  {" "}
                  · {t("totalSuffix", { n: s.totalClaimed })}
                </span>
              </span>
            </div>
          );
        })}
      </div>
      <p className="hint">{t("tiebreakNote")}</p>
      <button className="btn" style={{ maxWidth: 360 }} onClick={() => navigate("/")}>
        {t("backHome")}
      </button>
    </div>
  );
}
