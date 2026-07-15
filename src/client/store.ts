// Per-lobby session persisted in localStorage so a refresh reconnects as the
// same team. Keyed by lobby code.

export interface Session {
  code: string;
  teamId: string;
  token: string;
  color: string;
  teamName: string;
}

const keyFor = (code: string) => `cs:session:${code.toUpperCase()}`;

export function saveSession(s: Session): void {
  try {
    localStorage.setItem(keyFor(s.code), JSON.stringify(s));
  } catch {
    /* storage unavailable */
  }
}

export function getSession(code: string): Session | null {
  try {
    const v = localStorage.getItem(keyFor(code));
    return v ? (JSON.parse(v) as Session) : null;
  } catch {
    return null;
  }
}
