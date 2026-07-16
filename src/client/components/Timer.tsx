import { useEffect, useState } from "react";

/** Countdown to `endsAt`. `offset` = server clock minus client clock (ms). */
export function Timer({
  endsAt,
  offset,
  label,
  small,
}: {
  endsAt: number;
  offset: number;
  label?: string;
  small?: boolean;
}) {
  const [now, setNow] = useState(() => Date.now() + offset);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now() + offset), 500);
    return () => clearInterval(id);
  }, [offset]);

  const remaining = Math.max(0, endsAt - now);
  const totalSec = Math.floor(remaining / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  const clock = h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;

  return (
    <div className={`timer ${small ? "timer-sm" : ""} ${!small && remaining < 60_000 ? "low" : ""}`}>
      {label && <span className="timer-label">{label}</span>}
      {clock}
    </div>
  );
}
