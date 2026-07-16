import { useNavigate } from "react-router-dom";
import logoUrl from "../assets/logo.png";

export function Index() {
  const navigate = useNavigate();
  return (
    <div className="screen centered">
      <div>
        <img src={logoUrl} alt="City Scramble" className="brand-logo" />
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
      <button className="btn ghost" onClick={() => navigate("/about")}>
        Rules / About
      </button>
      <p className="attribution">Map data © OpenStreetMap contributors</p>
    </div>
  );
}
