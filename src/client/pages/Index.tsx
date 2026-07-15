import { useNavigate } from "react-router-dom";

export function Index() {
  const navigate = useNavigate();
  return (
    <div className="screen centered">
      <div>
        <div className="brand">City Scramble</div>
        <p className="tagline">
          Claim city districts in the real world. Biggest connected cluster wins.
        </p>
      </div>
      <button className="btn" onClick={() => navigate("/create")}>
        Create a game
      </button>
      <button className="btn secondary" onClick={() => navigate("/join")}>
        Join a game
      </button>
      <p className="attribution">Map data © OpenStreetMap contributors</p>
    </div>
  );
}
