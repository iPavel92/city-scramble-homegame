// Distinct, high-contrast team colors (readable as map fills on mobile).
// Order defines assignment as teams join.
export const TEAM_COLORS: string[] = [
  "#e6194b", // red
  "#4363d8", // blue
  "#3cb44b", // green
  "#f58231", // orange
  "#911eb4", // purple
  "#42d4f4", // cyan
  "#f032e6", // magenta
  "#9a6324", // brown
  "#469990", // teal
  "#808000", // olive
];

/** Pick the next unused color for a joining team. Falls back to cycling. */
export function nextColor(used: string[]): string {
  for (const c of TEAM_COLORS) {
    if (!used.includes(c)) return c;
  }
  return TEAM_COLORS[used.length % TEAM_COLORS.length];
}
