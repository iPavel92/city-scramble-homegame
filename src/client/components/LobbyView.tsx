import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { GameStateView } from "../../shared/types";
import { MapView, type MapFeature } from "./MapView";
import { useI18n } from "../i18n";

export function LobbyView({
  state,
  isHost,
  onStart,
}: {
  state: GameStateView;
  isHost: boolean;
  onStart: () => void;
}) {
  const navigate = useNavigate();
  const { t, lang } = useI18n();
  const [copied, setCopied] = useState(false);

  const copyLink = async () => {
    // Carry the host's language so a teammate who joins by link matches it.
    const linkLang = state.params.challengeLang ?? lang;
    const link = `${location.origin}/join?code=${state.code}&lang=${linkLang}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked */
    }
  };

  const hours = Math.floor(state.params.timeLimitMs / 3_600_000);
  const mins = Math.floor((state.params.timeLimitMs % 3_600_000) / 60_000);
  const unveilMs = state.params.privateUnlockPeriodMs ?? 0;
  const unveilLabel =
    unveilMs > 0
      ? `${Math.floor(unveilMs / 3_600_000)}h ${String(
          Math.floor((unveilMs % 3_600_000) / 60_000),
        ).padStart(2, "0")}m`
      : t("allAtStart");
  const canStart = state.teams.length >= 2;

  const mapFeatures: MapFeature[] = useMemo(
    () =>
      state.areas.map((a) => ({
        area: a,
        style: { color: "#000000", weight: 1.5, fillColor: "#000000", fillOpacity: 0 },
        tooltip: a.name,
      })),
    [state.areas],
  );

  return (
    <div className="screen">
      <h2>{t("lobby")}</h2>
      <div className="card code-box">
        <div className="hint">{t("shareCode")}</div>
        <div className="code">{state.code}</div>
        <button className="btn secondary" onClick={copyLink}>
          {copied ? t("copied") : t("copyInviteLink")}
        </button>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <div className="row-between">
          <span>{t("gameTimeLimit")}</span>
          <strong>
            {hours}h {String(mins).padStart(2, "0")}m
          </strong>
        </div>
        <div className="row-between">
          <span>{t("openDeckFlopSize")}</span>
          <strong>{state.params.openInPlay}</strong>
        </div>
        <div className="row-between">
          <span>{t("privateDeckSize")}</span>
          <strong>{state.params.privateDeckSize}</strong>
        </div>
        {unveilMs > 0 && (
          <div className="row-between">
            <span>{t("privateUnveilPeriod")}</span>
            <strong>{unveilLabel}</strong>
          </div>
        )}
      </div>

      {mapFeatures.length > 0 && (
        <>
          <label style={{ marginTop: 14 }}>{t("gameArea")}</label>
          <MapView
            features={mapFeatures}
            fitSignature={state.code}
            className="map lobby-map"
          />
        </>
      )}

      <label style={{ marginTop: 14 }}>{t("teamsCount", { n: state.teams.length })}</label>
      <div className="team-list">
        {state.teams.map((team) => (
          <div className="team-row" key={team.id}>
            <span className="dot" style={{ background: team.color }} />
            <span className="name">{team.name}</span>
            {team.id === state.youTeamId && <span className="tag">{t("you")}</span>}
            {team.isHost && <span className="tag">{t("host")}</span>}
          </div>
        ))}
      </div>

      {isHost ? (
        <>
          <button
            className="btn"
            style={{ marginTop: 16 }}
            disabled={!canStart}
            onClick={onStart}
          >
            {t("startGame")}
          </button>
          {!canStart && (
            <p className="hint" style={{ marginTop: 8 }}>
              {t("needAnotherTeam")}
            </p>
          )}
        </>
      ) : (
        <p className="hint" style={{ marginTop: 16 }}>
          {t("waitingForHost")}
        </p>
      )}
      <button className="btn ghost" style={{ marginTop: 8 }} onClick={() => navigate("/")}>
        {t("leave")}
      </button>
      <div className="attribution">{t("mapAttribution")}</div>
    </div>
  );
}
