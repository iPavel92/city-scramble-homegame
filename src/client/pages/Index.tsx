import { useNavigate } from "react-router-dom";
import logoUrl from "../assets/logo.png";
import { useI18n } from "../i18n";
import { LanguagePicker } from "../components/LanguagePicker";

export function Index() {
  const navigate = useNavigate();
  const { t } = useI18n();
  return (
    <div className="screen centered">
      <div>
        <img src={logoUrl} alt="City Scramble" className="brand-logo" />
        <p className="tagline">{t("tagline")}</p>
      </div>
      <button className="btn" onClick={() => navigate("/create")}>
        {t("createGame")}
      </button>
      <button className="btn secondary" onClick={() => navigate("/join")}>
        {t("joinGame")}
      </button>
      <button className="btn ghost" onClick={() => navigate("/about")}>
        {t("rulesAbout")}
      </button>
      <LanguagePicker />
      <p className="attribution">{t("mapAttribution")}</p>
    </div>
  );
}
