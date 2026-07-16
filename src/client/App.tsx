import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Index } from "./pages/Index";
import { CreateLobby } from "./pages/CreateLobby";
import { JoinLobby } from "./pages/JoinLobby";
import { About } from "./pages/About";
import { Play } from "./pages/Play";

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Index />} />
        <Route path="/create" element={<CreateLobby />} />
        <Route path="/join" element={<JoinLobby />} />
        <Route path="/about" element={<About />} />
        <Route path="/lobby/:code" element={<Play />} />
        <Route path="/game/:code" element={<Play />} />
        <Route path="*" element={<Index />} />
      </Routes>
    </BrowserRouter>
  );
}
