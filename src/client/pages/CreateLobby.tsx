import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { saveSession } from "../store";
import { buildAiPrompt, challengeTemplate, validateChallengeJson } from "../challenges";
import { defaultChallengePool } from "../../shared/challenges.i18n";
import { AreaSelector, type AreaSelection } from "../components/AreaSelector";
import { useI18n } from "../i18n";

type ChallengeMode = "default" | "custom";

export function CreateLobby() {
  const navigate = useNavigate();
  const { t, lang } = useI18n();
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
  const [promptCopied, setPromptCopied] = useState(false);

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

  // How many teams these deck sizes can support: teams*Y + X <= areas.
  // (Capped at the server's 10-team maximum.)
  const maxTeams = Math.min(
    10,
    y > 0 ? Math.max(0, Math.floor((selectedCount - x) / y)) : 10,
  );

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
  // when team size or language changes.
  const exampleChallenges = useMemo(() => {
    const pool = defaultChallengePool(teamSize, lang);
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool.slice(0, 3);
  }, [teamSize, lang]);

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
      setChallengeMsg(t("clipboardTemplateFallback"));
    }
  };

  const copyAiPrompt = async () => {
    const text = buildAiPrompt(selectedAreas, lang);
    try {
      await navigator.clipboard.writeText(text);
      setPromptCopied(true);
      setTimeout(() => setPromptCopied(false), 2000);
    } catch {
      // No clipboard access — drop the prompt into the box to copy manually.
      setChallengeText(text);
      setImportedChallenges(null);
      setChallengeMsg(t("clipboardPromptFallback"));
    }
  };

  const importChallenges = () => {
    const result = validateChallengeJson(challengeText, selectedAreas);
    if (!result.ok) {
      setImportedChallenges(null);
      setChallengeMsg(t(result.code, "params" in result ? result.params : undefined));
      return;
    }
    setImportedChallenges(result.map);
    const n = Object.keys(result.map).length;
    const total = selectedAreas.length;
    const rest = total - n;
    setChallengeMsg(
      rest > 0
        ? t("importCoverage", { n, total, rest })
        : t("importAll", { total }),
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
          challengeLang: lang,
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
          <h2>{t("chooseMap")}</h2>
          <AreaSelector initial={sel ?? undefined} onChange={setSel} />
          <div className="btn-row" style={{ marginTop: 10 }}>
            <button className="btn ghost" onClick={() => navigate("/")}>
              {t("cancel")}
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
              {t("next")}
            </button>
          </div>
        </>
      )}

      {step === 2 && (
        <div className="wizard-body">
          <h2>{t("gameSettings")}</h2>
          <label>{t("gameTimeLimit")}</label>
          <div className="btn-row">
            <div className="grow">
              <input
                inputMode="numeric"
                value={hh}
                onChange={(e) => setHh(e.target.value.replace(/\D/g, "").slice(0, 2))}
                aria-label={t("hours")}
              />
              <div className="field-hint">{t("hours")}</div>
            </div>
            <div className="grow">
              <input
                inputMode="numeric"
                value={mm}
                onChange={(e) => setMm(e.target.value.replace(/\D/g, "").slice(0, 2))}
                aria-label={t("minutes")}
              />
              <div className="field-hint">{t("minutes")}</div>
            </div>
          </div>

          <label>{t("openDeckFlopSize")}</label>
          <input
            inputMode="numeric"
            value={openX}
            onChange={(e) => {
              setOpenX(e.target.value.replace(/\D/g, "").slice(0, 3));
              setDeckSizesTouched(true);
            }}
          />
          <div className="field-hint">{t("openDeckFlopHint")}</div>

          <label>{t("privateDeckSize")}</label>
          <input
            inputMode="numeric"
            value={privateY}
            onChange={(e) => {
              setPrivateY(e.target.value.replace(/\D/g, "").slice(0, 3));
              setDeckSizesTouched(true);
            }}
          />
          <div className="field-hint">{t("privateDeckSizeHint")}</div>
          <div className={`field-hint ${maxTeams < 2 ? "hint-warn" : ""}`}>
            {t("supportsTeams", { n: maxTeams, areas: selectedCount })}
          </div>

          <label>{t("privateUnveilPeriod")}</label>
          <div className="btn-row">
            <div className="grow">
              <input
                inputMode="numeric"
                value={unlockHh}
                onChange={(e) => setUnlockHh(e.target.value.replace(/\D/g, "").slice(0, 2))}
                aria-label={t("hours")}
              />
              <div className="field-hint">{t("hours")}</div>
            </div>
            <div className="grow">
              <input
                inputMode="numeric"
                value={unlockMm}
                onChange={(e) => setUnlockMm(e.target.value.replace(/\D/g, "").slice(0, 2))}
                aria-label={t("minutes")}
              />
              <div className="field-hint">{t("minutes")}</div>
            </div>
          </div>
          <div className="field-hint">{t("privateUnveilHint")}</div>

          <div className="btn-row" style={{ marginTop: "auto" }}>
            <button className="btn ghost" onClick={() => setStep(1)}>
              {t("back")}
            </button>
            <button className="btn" disabled={!step2Ok} onClick={() => setStep(3)}>
              {t("next")}
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="wizard-body">
          <h2>{t("challenges")}</h2>
          <p className="field-hint">{t("challengesIntro")}</p>

          <label className="toggle-row">
            <input
              type="radio"
              name="challenge-mode"
              checked={challengeMode === "default"}
              onChange={() => setChallengeMode("default")}
            />
            <span>{t("useDefaultChallenges")}</span>
          </label>
          {challengeMode === "default" && (
            <div style={{ marginTop: 8 }}>
              <label>{t("teamSize")}</label>
              <div className="chips">
                <button
                  className={`chip ${teamSize === 1 ? "active" : ""}`}
                  onClick={() => setTeamSize(1)}
                >
                  {t("onePlayer")}
                </button>
                <button
                  className={`chip ${teamSize === 2 ? "active" : ""}`}
                  onClick={() => setTeamSize(2)}
                >
                  {t("twoPlayers")}
                </button>
              </div>
              <div className="field-hint">
                {teamSize === 2 ? t("teamSize2Hint") : t("teamSize1Hint")}
              </div>
              <div className="examples-header">{t("examplesHeader")}</div>
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
            <span>{t("useCustomChallenges")}</span>
          </label>

          {challengeMode === "custom" && (
            <div style={{ marginTop: 12 }}>
              <div className="field-hint" style={{ marginBottom: 8 }}>
                {t("customChallengesIntro")}
              </div>
              <button className="btn secondary" onClick={copyTemplate}>
                {copied ? t("copied") : t("copyTemplate")}
              </button>
              <div className="field-hint" style={{ marginTop: 10 }}>
                {t("aiPromptIntro")}
              </div>
              <button
                className="btn secondary"
                style={{ marginTop: 6 }}
                onClick={copyAiPrompt}
              >
                {promptCopied ? t("copied") : t("copyPromptForAi")}
              </button>
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
              <button
                className="btn"
                disabled={!challengeText.trim()}
                onClick={importChallenges}
              >
                {t("importChallenges")}
              </button>
              {challengeMsg && (
                <div className={`msg ${importedChallenges ? "ok" : "err"}`}>{challengeMsg}</div>
              )}
            </div>
          )}

          <div className="btn-row" style={{ marginTop: "auto" }}>
            <button className="btn ghost" onClick={() => setStep(2)}>
              {t("back")}
            </button>
            <button className="btn" disabled={!step3Ok} onClick={() => setStep(4)}>
              {t("next")}
            </button>
          </div>
          {challengeMode === "custom" && !step3Ok && (
            <div className="hint">{t("importContinueHint")}</div>
          )}
        </div>
      )}

      {step === 4 && (
        <div className="wizard-body">
          <h2>{t("yourTeam")}</h2>
          <label htmlFor="host-team">{t("teamName")}</label>
          <input
            id="host-team"
            value={teamName}
            maxLength={24}
            placeholder={t("teamNamePlaceholder")}
            autoComplete="name"
            name="name"
            onChange={(e) => setTeamName(e.target.value)}
          />
          <div className="field-hint">{t("hostStartHint")}</div>
          <div className="btn-row" style={{ marginTop: "auto" }}>
            <button className="btn ghost" onClick={() => setStep(3)}>
              {t("back")}
            </button>
            <button
              className="btn"
              disabled={busy || teamName.trim().length === 0}
              onClick={create}
            >
              {busy ? t("creating") : t("createLobby")}
            </button>
          </div>
        </div>
      )}

      {error && <div className="error-toast">{error}</div>}
    </div>
  );
}
