import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { saveSession } from "../store";
import { AreaSelector, type AreaSelection } from "../components/AreaSelector";

export function CreateLobby() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [sel, setSel] = useState<AreaSelection | null>(null);

  // Step 2 params
  const [hh, setHh] = useState("01");
  const [mm, setMm] = useState("30");
  const [privateY, setPrivateY] = useState("2");
  const [openX, setOpenX] = useState("3");
  const [unlockHh, setUnlockHh] = useState("00");
  const [unlockMm, setUnlockMm] = useState("00");

  // Step 3
  const [teamName, setTeamName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedCount = sel?.selectedIds.length ?? 0;
  const timeLimitMs =
    (parseInt(hh || "0", 10) * 60 + parseInt(mm || "0", 10)) * 60_000;

  const step1Ok = selectedCount >= 1;
  const y = parseInt(privateY || "0", 10);
  const x = parseInt(openX || "0", 10);
  const privateUnlockPeriodMs =
    (parseInt(unlockHh || "0", 10) * 60 + parseInt(unlockMm || "0", 10)) * 60_000;
  const unlockOk = privateUnlockPeriodMs === 0 || privateUnlockPeriodMs < timeLimitMs;
  const step2Ok =
    timeLimitMs > 0 &&
    x >= 1 &&
    y >= 0 &&
    x <= selectedCount &&
    y * 1 + x <= selectedCount && // host alone; more teams checked at start
    unlockOk;

  const create = async () => {
    if (!sel) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.createLobby({
        cacheKey: sel.cacheKey,
        selectedAreaIds: sel.selectedIds,
        params: { timeLimitMs, privateDeckSize: y, openInPlay: x, privateUnlockPeriodMs },
        teamName: teamName.trim(),
      });
      saveSession({
        code: res.code,
        teamId: res.teamId,
        token: res.token,
        color: res.color,
        teamName: teamName.trim() || "Host",
      });
      navigate(`/lobby/${res.code}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="screen">
      <div className="steps">
        {[1, 2, 3].map((n) => (
          <div key={n} className={`step ${step >= n ? "active" : ""}`} />
        ))}
      </div>

      {step === 1 && (
        <>
          <h2>Choose the map</h2>
          <AreaSelector initial={sel ?? undefined} onChange={setSel} />
          <div className="btn-row" style={{ marginTop: 10 }}>
            <button className="btn ghost" onClick={() => navigate("/")}>
              Cancel
            </button>
            <button className="btn" disabled={!step1Ok} onClick={() => setStep(2)}>
              Next
            </button>
          </div>
        </>
      )}

      {step === 2 && (
        <div className="wizard-body">
          <h2>Game settings</h2>
          <label>Time limit</label>
          <div className="btn-row">
            <div className="grow">
              <input
                inputMode="numeric"
                value={hh}
                onChange={(e) => setHh(e.target.value.replace(/\D/g, "").slice(0, 2))}
                aria-label="hours"
              />
              <div className="field-hint">hours</div>
            </div>
            <div className="grow">
              <input
                inputMode="numeric"
                value={mm}
                onChange={(e) => setMm(e.target.value.replace(/\D/g, "").slice(0, 2))}
                aria-label="minutes"
              />
              <div className="field-hint">minutes</div>
            </div>
          </div>

          <label>Private deck size per team (Y)</label>
          <input
            inputMode="numeric"
            value={privateY}
            onChange={(e) => setPrivateY(e.target.value.replace(/\D/g, "").slice(0, 3))}
          />
          <div className="field-hint">Exclusive areas each team can claim only for itself.</div>

          <label>Open deck areas in play (X)</label>
          <input
            inputMode="numeric"
            value={openX}
            onChange={(e) => setOpenX(e.target.value.replace(/\D/g, "").slice(0, 3))}
          />
          <div className="field-hint">
            Shared areas visible at once. A new one appears whenever one is claimed.
          </div>

          <label>Time to next private area</label>
          <div className="btn-row">
            <div className="grow">
              <input
                inputMode="numeric"
                value={unlockHh}
                onChange={(e) => setUnlockHh(e.target.value.replace(/\D/g, "").slice(0, 2))}
                aria-label="unlock hours"
              />
              <div className="field-hint">hours</div>
            </div>
            <div className="grow">
              <input
                inputMode="numeric"
                value={unlockMm}
                onChange={(e) => setUnlockMm(e.target.value.replace(/\D/g, "").slice(0, 2))}
                aria-label="unlock minutes"
              />
              <div className="field-hint">minutes</div>
            </div>
          </div>
          <div className="field-hint">
            Private areas unlock one at a time on this interval. 0 = all from the start. Must
            be less than the game time limit.
          </div>

          <div className="card" style={{ marginTop: 8 }}>
            <div className="row-between">
              <span>Areas selected</span>
              <strong>{selectedCount}</strong>
            </div>
            <div className="hint" style={{ textAlign: "left", marginTop: 6 }}>
              You need at least Y × (number of teams) + 1 areas. With more teams you may need
              more — you can add areas by going back.
            </div>
          </div>

          <div className="btn-row" style={{ marginTop: "auto" }}>
            <button className="btn ghost" onClick={() => setStep(1)}>
              Back
            </button>
            <button className="btn" disabled={!step2Ok} onClick={() => setStep(3)}>
              Next
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="wizard-body">
          <h2>Your team</h2>
          <label htmlFor="host-team">Team name</label>
          <input
            id="host-team"
            value={teamName}
            maxLength={24}
            placeholder="Team Captain"
            onChange={(e) => setTeamName(e.target.value)}
          />
          <div className="field-hint">You are the host and can start the game.</div>
          <div className="btn-row" style={{ marginTop: "auto" }}>
            <button className="btn ghost" onClick={() => setStep(2)}>
              Back
            </button>
            <button
              className="btn"
              disabled={busy || teamName.trim().length === 0}
              onClick={create}
            >
              {busy ? "Creating…" : "Create lobby"}
            </button>
          </div>
        </div>
      )}

      {error && <div className="error-toast">{error}</div>}
    </div>
  );
}
