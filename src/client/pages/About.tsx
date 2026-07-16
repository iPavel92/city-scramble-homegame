import { useNavigate } from "react-router-dom";
import { useI18n } from "../i18n";

const JETLAG_URL =
  "https://www.youtube.com/watch?v=ozik7Ba4gkU&list=PLB7ZcpBcwdC4gFeZSxp55tgVXo4tJCsrv";
const GITHUB_URL = "https://github.com/iPavel92/city-scramble-homegame";

function Swatch({ color, opacity }: { color: string; opacity: number }) {
  return (
    <span
      className="swatch"
      style={{ background: color, opacity }}
      aria-hidden="true"
    />
  );
}

export function About() {
  const navigate = useNavigate();
  const { t } = useI18n();
  return (
    <div className="screen">
      <h2>{t("aboutTitle")}</h2>

      <div className="about">
        <p>
          {t("aboutIntroBefore")}
          <a href={JETLAG_URL} target="_blank" rel="noreferrer">
            {t("aboutJetLagLink")}
          </a>
          {t("aboutIntroAfter")}
        </p>

        <h3>{t("aboutWinTitle")}</h3>
        <p>{t("aboutWin")}</p>

        <h3>{t("aboutFlopTitle")}</h3>
        <p>{t("aboutFlop")}</p>

        <h3>{t("aboutAreaTypesTitle")}</h3>
        <ul>
          <li>
            <strong>{t("aboutOpenDeckLabel")}</strong> {t("aboutOpenDeckDesc")}
          </li>
          <li>
            <strong>{t("aboutPrivateDeckLabel")}</strong> {t("aboutPrivateDeckDesc")}
          </li>
        </ul>

        <h3>{t("aboutHowToPlayTitle")}</h3>
        <ol>
          <li>{t("aboutStep1")}</li>
          <li>{t("aboutStep2")}</li>
          <li>{t("aboutStep3")}</li>
        </ol>
        <p>{t("aboutColorsIntro")}</p>
        <ul className="legend">
          <li>
            <Swatch color="#94a3b8" opacity={0.4} /> {t("aboutLegendOpen")}
          </li>
          <li>
            <Swatch color="#38bdf8" opacity={0.35} /> {t("aboutLegendPrivate")}
          </li>
          <li>
            <Swatch color="#38bdf8" opacity={1} /> {t("aboutLegendClaimed")}
          </li>
        </ul>
        <p>{t("aboutTopBar")}</p>

        <h3>{t("aboutDisclaimerTitle")}</h3>
        <p>
          {t("aboutDisclaimerBefore")}
          <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
            {t("aboutOsmLink")}
          </a>
          {t("aboutDisclaimerAfter")}
        </p>
        <p>
          {t("aboutSource")}
          <a href={GITHUB_URL} target="_blank" rel="noreferrer">
            github.com/iPavel92/city-scramble-homegame
          </a>
        </p>
      </div>

      <button className="btn ghost" onClick={() => navigate("/")}>
        {t("backToMenu")}
      </button>
    </div>
  );
}
