import { LANGS, type Lang } from "../../shared/i18n";
import { useI18n } from "../i18n";

/** Language dropdown used on the main menu. */
export function LanguagePicker() {
  const { lang, setLang, t } = useI18n();
  return (
    <label className="lang-picker">
      <span>{t("language")}</span>
      <select value={lang} onChange={(e) => setLang(e.target.value as Lang)}>
        {LANGS.map((l) => (
          <option key={l.code} value={l.code}>
            {l.label}
          </option>
        ))}
      </select>
    </label>
  );
}
