import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { GameStateView } from "../../shared/types";
import { MapView, type MapFeature } from "./MapView";

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
  const [copied, setCopied] = useState(false);

  const copyLink = async () => {
    const link = `${location.origin}/join?code=${state.code}`;
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
      <h2>Lobby</h2>
      <div className="card code-box">
        <div className="hint">Share this code</div>
        <div className="code">{state.code}</div>
        <button className="btn secondary" onClick={copyLink}>
          {copied ? "Copied!" : "Copy invite link"}
        </button>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <div className="row-between">
          <span>Time limit</span>
          <strong>
            {hours}h {String(mins).padStart(2, "0")}m
          </strong>
        </div>
        <div className="row-between">
          <span>Private deck (Y)</span>
          <strong>{state.params.privateDeckSize}</strong>
        </div>
        <div className="row-between">
          <span>Open deck in play (X)</span>
          <strong>{state.params.openInPlay}</strong>
        </div>
      </div>

      {mapFeatures.length > 0 && (
        <>
          <label style={{ marginTop: 14 }}>Game area</label>
          <MapView
            features={mapFeatures}
            fitSignature={state.code}
            className="map lobby-map"
          />
        </>
      )}

      <label style={{ marginTop: 14 }}>Teams ({state.teams.length})</label>
      <div className="team-list">
        {state.teams.map((t) => (
          <div className="team-row" key={t.id}>
            <span className="dot" style={{ background: t.color }} />
            <span className="name">{t.name}</span>
            {t.id === state.youTeamId && <span className="tag">you</span>}
            {t.isHost && <span className="tag">host</span>}
          </div>
        ))}
      </div>

      {isHost ? (
        <button className="btn" style={{ marginTop: 16 }} onClick={onStart}>
          Start game
        </button>
      ) : (
        <p className="hint" style={{ marginTop: 16 }}>
          Waiting for the host to start the game…
        </p>
      )}
      <button className="btn ghost" style={{ marginTop: 8 }} onClick={() => navigate("/")}>
        Leave
      </button>
      <div className="attribution">Map data © OpenStreetMap contributors</div>
    </div>
  );
}
