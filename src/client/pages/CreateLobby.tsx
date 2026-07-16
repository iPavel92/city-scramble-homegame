import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { saveSession } from "../store";
import { challengeTemplate, validateChallengeJson } from "../challenges";
import { defaultChallengePool } from "../../shared/challenges";
import { AreaSelector, type AreaSelection } from "../components/AreaSelector";

type ChallengeMode = "default" | "custom";

export function CreateLobby() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [sel, setSel] = useState<AreaSelection | null>(null);

  // Step 2 params
  const [hh, setHh] = useState("6");
  const [mm, setMm] = useState("00");
  const [privateY, setPrivateY] = useState("2");
  const [openX, setOpenX] = useState("3");
  const [unlockHh, setUnlockHh] = useState("1");
  const [unlockMm, setUnlockMm] = useState("00");
  // Whether the host has manually edited the deck sizes (else we default them
  // to ~10% of the selected areas when entering the settings step).
  const [deckSizesTouched, setDeckSizesTouched] = useState(false);

  // Step 3 challenges
  const [challengeMode, setChallengeMode] = useState<ChallengeMode>("default");
  const [teamSize, setTeamSize] = useState(1);
  const [challengeText, setChallengeText] = useState("");
  const [importedChallenges, setImportedChallenges] = useState<Record<string, string> | null>(null);
  const [challengeMsg, setChallengeMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Step 4
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
    x >= 2 &&
    y >= 0 &&
    x <= selectedCount &&
    y * 1 + x <= selectedCount && // host alone; more teams checked at start
    unlockOk;

  // The set of areas that will actually be in the game (id + name).
  const selectedAreas = useMemo(
    () => (sel ? sel.areas.filter((a) => sel.selectedIds.includes(a.id)) : []),
    [sel],
  );

  // If the game area changes, any imported challenges no longer apply — drop them.
  const selectionKey = sel ? sel.selectedIds.slice().sort().join("|") : "";
  useEffect(() => {
    setImportedChallenges(null);
    setChallengeMsg(null);
  }, [selectionKey]);

  const step3Ok = challengeMode === "default" || importedChallenges !== null;

  // Three random challenges shown as examples of the default pool. Reshuffles
  // when the team size changes so teammate challenges can appear for 2-player.
  const exampleChallenges = useMemo(() => {
    const pool = defaultChallengePool(teamSize);
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool.slice(0, 3);
  }, [teamSize]);

  const copyTemplate = async () => {
    const text = challengeTemplate(selectedAreas);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // No clipboard access — drop the template into the box to copy manually.
      setChallengeText(text);
      setImportedChallenges(null);
      setChallengeMsg("Couldn't reach the clipboard — template placed in the box below.");
    }
  };

  const importChallenges = () => {
    const result = validateChallengeJson(challengeText, selectedAreas);
    if (!result.ok) {
      setImportedChallenges(null);
      setChallengeMsg(result.error);
      return;
    }
    setImportedChallenges(result.map);
    const n = Object.keys(result.map).length;
    const total = selectedAreas.length;
    const rest = total - n;
    setChallengeMsg(
      rest > 0
        ? `Imported challenges for ${n} of ${total} areas. The other ${rest} will use random default challenges.`
        : `Validated — custom challenges set for all ${total} areas.`,
    );
  };

  const create = async () => {
    if (!sel) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.createLobby({
        cacheKey: sel.cacheKey,
        selectedAreaIds: sel.selectedIds,
        params: {
          timeLimitMs,
          privateDeckSize: y,
          openInPlay: x,
          privateUnlockPeriodMs,
          teamSize: challengeMode === "default" ? teamSize : 1,
        },
        teamName: teamName.trim(),
        customChallenges:
          challengeMode === "custom" ? importedChallenges ?? undefined : undefined,
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
        {[1, 2, 3, 4].map((n) => (
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
            <button
              className="btn"
              disabled={!step1Ok}
              onClick={() => {
                if (!deckSizesTouched) {
                  const base = Math.round(selectedCount * 0.1);
                  setPrivateY(String(Math.max(1, base)));
                  setOpenX(String(Math.max(2, base)));
                }
                setStep(2);
              }}
            >
              Next
            </button>
          </div>
        </>
      )}

      {step === 2 && (
        <div className="wizard-body">
          <h2>Game settings</h2>
          <label>Game Time limit</label>
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

          <label>Open deck flop size</label>
          <input
            inputMode="numeric"
            value={openX}
            onChange={(e) => {
              setOpenX(e.target.value.replace(/\D/g, "").slice(0, 3));
              setDeckSizesTouched(true);
            }}
          />
          <div className="field-hint">
            Shared areas visible at once (minimum 2). A new one appears whenever one is claimed.
          </div>

          <label>Private deck size</label>
          <input
            inputMode="numeric"
            value={privateY}
            onChange={(e) => {
              setPrivateY(e.target.value.replace(/\D/g, "").slice(0, 3));
              setDeckSizesTouched(true);
            }}
          />
          <div className="field-hint">Exclusive areas each team can claim only for itself.</div>

          <label>Private deck unveil period</label>
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
          <h2>Challenges</h2>
          <p className="field-hint">
            Each area gets a challenge a team must complete to claim it.
          </p>

          <label className="toggle-row">
            <input
              type="radio"
              name="challenge-mode"
              checked={challengeMode === "default"}
              onChange={() => setChallengeMode("default")}
            />
            <span>Use default generic challenges</span>
          </label>
          {challengeMode === "default" && (
            <div style={{ marginTop: 8 }}>
              <label>Team size</label>
              <div className="chips">
                <button
                  className={`chip ${teamSize === 1 ? "active" : ""}`}
                  onClick={() => setTeamSize(1)}
                >
                  1 player
                </button>
                <button
                  className={`chip ${teamSize === 2 ? "active" : ""}`}
                  onClick={() => setTeamSize(2)}
                >
                  2 players
                </button>
              </div>
              <div className="field-hint">
                {teamSize === 2
                  ? "Adds two-person teammate challenges to the pool."
                  : "Solo-friendly challenges only."}
              </div>
              <ul className="examples">
                {exampleChallenges.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            </div>
          )}
          <label className="toggle-row">
            <input
              type="radio"
              name="challenge-mode"
              checked={challengeMode === "custom"}
              onChange={() => setChallengeMode("custom")}
            />
            <span>Use custom challenges</span>
          </label>

          {challengeMode === "custom" && (
            <div style={{ marginTop: 12 }}>
              <div className="field-hint" style={{ marginBottom: 8 }}>
                Copy the template, fill in the challenges you want, paste it back, then Import.
                Matched by area name; any area you leave out uses a random default challenge.
              </div>
              <div className="btn-row">
                <button className="btn secondary" onClick={copyTemplate}>
                  {copied ? "Copied!" : "Copy template"}
                </button>
                <button
                  className="btn"
                  disabled={!challengeText.trim()}
                  onClick={importChallenges}
                >
                  Import challenges
                </button>
              </div>
              <textarea
                className="challenge-box"
                value={challengeText}
                placeholder='[{"area":"...","challenge":"..."}]'
                spellCheck={false}
                onChange={(e) => {
                  setChallengeText(e.target.value);
                  // Editing invalidates a prior import until re-validated.
                  if (importedChallenges) {
                    setImportedChallenges(null);
                    setChallengeMsg(null);
                  }
                }}
              />
              {challengeMsg && (
                <div className={`msg ${importedChallenges ? "ok" : "err"}`}>{challengeMsg}</div>
              )}
            </div>
          )}

          <div className="btn-row" style={{ marginTop: "auto" }}>
            <button className="btn ghost" onClick={() => setStep(2)}>
              Back
            </button>
            <button className="btn" disabled={!step3Ok} onClick={() => setStep(4)}>
              Next
            </button>
          </div>
          {challengeMode === "custom" && !step3Ok && (
            <div className="hint">Import your challenges to continue.</div>
          )}
        </div>
      )}

      {step === 4 && (
        <div className="wizard-body">
          <h2>Your team</h2>
          <label htmlFor="host-team">Team name</label>
          <input
            id="host-team"
            value={teamName}
            maxLength={24}
            placeholder="Team Captain"
            autoComplete="name"
            name="name"
            onChange={(e) => setTeamName(e.target.value)}
          />
          <div className="field-hint">You are the host and can start the game.</div>
          <div className="btn-row" style={{ marginTop: "auto" }}>
            <button className="btn ghost" onClick={() => setStep(3)}>
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
