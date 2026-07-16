import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getSession } from "../store";
import { useLobby } from "../ws";
import { LobbyView } from "../components/LobbyView";
import { GameView } from "../components/GameView";
import { useI18n } from "../i18n";

export function Play() {
  const { code } = useParams();
  const navigate = useNavigate();
  const { t } = useI18n();
  const upper = code?.toUpperCase();
  const session = upper ? getSession(upper) : null;

  useEffect(() => {
    if (upper && !session) navigate(`/join?code=${upper}`, { replace: true });
  }, [upper, session, navigate]);

  const { state, error, connected, send, clearError } = useLobby(
    upper,
    session?.token ?? null,
  );

  const [offset, setOffset] = useState(0);
  useEffect(() => {
    if (state) setOffset(state.serverNow - Date.now());
  }, [state]);

  useEffect(() => {
    if (!error) return;
    const t = setTimeout(clearError, 3500);
    return () => clearTimeout(t);
  }, [error, clearError]);

  if (!upper || !session) return null;

  if (!state) {
    return (
      <div className="screen centered">
        <div className="spinner" />
        <p className="hint">{connected ? t("loadingGame") : t("connecting")}</p>
        {error && <div className="error-toast">{error}</div>}
      </div>
    );
  }

  const isHost = state.teams.find((t) => t.id === state.youTeamId)?.isHost ?? false;

  return (
    <>
      {state.phase === "lobby" ? (
        <LobbyView state={state} isHost={isHost} onStart={() => send({ t: "start" })} />
      ) : (
        <GameView
          state={state}
          offset={offset}
          onClaim={(areaId) => send({ t: "claim", areaId })}
          onProtect={(areaId) => send({ t: "protect", areaId })}
          onReplace={(areaId) => send({ t: "replace", areaId })}
        />
      )}
      {error && <div className="error-toast">{error}</div>}
    </>
  );
}
