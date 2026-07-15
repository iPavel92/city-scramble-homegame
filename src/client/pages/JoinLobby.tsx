import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { saveSession } from "../store";

export function JoinLobby() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [code, setCode] = useState((params.get("code") ?? "").toUpperCase());
  const [teamName, setTeamName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canJoin = /^[A-Za-z]{4}$/.test(code) && teamName.trim().length > 0 && !busy;

  const join = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await api.joinLobby(code.toUpperCase(), teamName.trim());
      saveSession({
        code: res.code,
        teamId: res.teamId,
        token: res.token,
        color: res.color,
        teamName: teamName.trim(),
      });
      navigate(`/lobby/${res.code}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="screen centered">
      <div className="brand" style={{ fontSize: "1.8rem" }}>
        Join a game
      </div>
      <div>
        <label htmlFor="code">Lobby code</label>
        <input
          id="code"
          value={code}
          maxLength={4}
          autoCapitalize="characters"
          autoCorrect="off"
          placeholder="ABCD"
          style={{ textTransform: "uppercase", letterSpacing: "0.3em", textAlign: "center" }}
          onChange={(e) => setCode(e.target.value.replace(/[^A-Za-z]/g, "").toUpperCase())}
        />
      </div>
      <div>
        <label htmlFor="team">Team name</label>
        <input
          id="team"
          value={teamName}
          maxLength={24}
          placeholder="The Trailblazers"
          onChange={(e) => setTeamName(e.target.value)}
        />
      </div>
      <button className="btn" disabled={!canJoin} onClick={join}>
        {busy ? "Joining…" : "Join lobby"}
      </button>
      <button className="btn ghost" onClick={() => navigate("/")}>
        Back
      </button>
      {error && <div className="error-toast">{error}</div>}
    </div>
  );
}
