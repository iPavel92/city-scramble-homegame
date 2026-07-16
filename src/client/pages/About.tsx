import { useNavigate } from "react-router-dom";

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
  return (
    <div className="screen">
      <h2>Rules &amp; About</h2>

      <div className="about">
        <p>
          City Scramble is a real-world, mobile territory game inspired by{" "}
          <a href={JETLAG_URL} target="_blank" rel="noreferrer">
            Jet Lag: The Game
          </a>
          . Teams roam a real city, complete area-specific challenges, and claim districts on a
          shared map.
        </p>

        <h3>How you win</h3>
        <p>
          The team with the most connected areas at the end of the game wins. This is based solely
          on the number of areas; in the case of a tie, the team with the largest area wins. Areas
          only count as connected when they touch along their borders.
        </p>

        <h3>The Flop</h3>
        <p>
          Gameplay revolves around a “Flop”. At the start of the game, some areas are randomly
          selected into the Flop, and only areas in the Flop may be claimed. Once an area is
          claimed, a new area is drawn to replace it, and the claiming team gets to pick one area
          already in the Flop to redraw as well. Each opposing team may protect one area from being
          redrawn.
        </p>

        <h3>Area types</h3>
        <ul>
          <li>
            <strong>Open deck areas</strong> — shared areas whose challenges everyone can see
            beforehand. These challenges can't be failed, though some carry a time penalty when
            re-attempted.
          </li>
          <li>
            <strong>Private deck areas</strong> — each team receives its own private areas and
            reveals one per period. Only that team can see and claim them; the other teams don't
            know they exist.
          </li>
        </ul>

        <h3>How to play</h3>
        <ol>
          <li>
            One team creates the lobby and configures the game area, timing, deck sizes, and
            challenges.
          </li>
          <li>The other teams join the lobby with the 4-letter code.</li>
          <li>Everyone shares live location and chats in any messaging app they like.</li>
        </ol>
        <p>Once the game starts, areas on the map are colored:</p>
        <ul className="legend">
          <li>
            <Swatch color="#94a3b8" opacity={0.4} /> translucent gray — shared open-deck areas
          </li>
          <li>
            <Swatch color="#38bdf8" opacity={0.35} /> translucent team color — your private areas
            (hidden from other teams)
          </li>
          <li>
            <Swatch color="#38bdf8" opacity={1} /> solid saturated color — areas claimed by a team
          </li>
        </ul>
        <p>
          At the top of the screen you can see the score (your largest connected cluster and total
          areas claimed), the countdown to the end of the game, and the countdown to your next
          private area. Whenever someone claims an area — or an action is required from you — the
          game notifies or prompts you.
        </p>

        <h3>Disclaimer</h3>
        <p>
          This game is not affiliated with, connected to, or produced by Jet Lag: The Game or
          Nebula. Map data and areas are sourced from{" "}
          <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
            OpenStreetMap
          </a>{" "}
          contributors.
        </p>
        <p>
          Source code:{" "}
          <a href={GITHUB_URL} target="_blank" rel="noreferrer">
            github.com/iPavel92/city-scramble-homegame
          </a>
        </p>
      </div>

      <button className="btn ghost" onClick={() => navigate("/")}>
        Back to menu
      </button>
    </div>
  );
}
