import type { AreaPlacement } from "../../shared/types";
import { useI18n } from "../i18n";

export function ChallengeSheet({
  areaName,
  placement,
  onClaim,
  onClose,
}: {
  areaName: string;
  placement: AreaPlacement;
  onClaim: () => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="row-between">
          <h3 style={{ margin: 0 }}>{areaName}</h3>
          <span className="pill">{placement.deck === "open" ? t("openDeck") : t("private")}</span>
        </div>
        <div className="muted">{t("completeToClaim")}</div>
        <div className="challenge">{placement.challenge}</div>
        <div className="btn-row">
          <button className="btn ghost" onClick={onClose}>
            {t("cancel")}
          </button>
          <button className="btn" onClick={onClaim}>
            {t("markClaimed")}
          </button>
        </div>
      </div>
    </div>
  );
}
