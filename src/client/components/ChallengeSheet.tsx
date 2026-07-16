import type { AreaPlacement } from "../../shared/types";

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
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="row-between">
          <h3 style={{ margin: 0 }}>{areaName}</h3>
          <span className="pill">{placement.deck === "open" ? "Open deck" : "Private"}</span>
        </div>
        <div className="muted">Complete the challenge to claim the area:</div>
        <div className="challenge">{placement.challenge}</div>
        <div className="btn-row">
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn" onClick={onClaim}>
            Mark as claimed
          </button>
        </div>
      </div>
    </div>
  );
}
