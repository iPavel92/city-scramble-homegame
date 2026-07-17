import { GameLobby, type InitAreaInput } from "./GameLobby";
import { searchCity, getAreas, getAreasInBounds, loadFullAreas, OsmError } from "./osm";
import { computeAdjacency } from "./adjacency";
import { simplifyGeometry } from "./geo";
import { generateCode, generateToken } from "./decks";
import { nextColor } from "../shared/colors";
import { normalizeLang } from "../shared/i18n";
import type {
  CreateLobbyRequest,
  CreateLobbyResponse,
  JoinLobbyRequest,
  JoinLobbyResponse,
} from "../shared/types";

export { GameLobby };

const MAX_AREAS = 120;

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}
function fail(message: string, status = 400): Response {
  return Response.json({ error: message }, { status });
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    try {
      if (path.startsWith("/api/")) return await handleApi(request, env, url);
      if (path.startsWith("/ws/")) return await handleWs(request, env, url);
    } catch (e) {
      if (e instanceof OsmError) return fail(e.message, e.status);
      return fail((e as Error).message || "Server error", 500);
    }
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;

async function handleApi(request: Request, env: Env, url: URL): Promise<Response> {
  const path = url.pathname;

  if (request.method === "GET" && path === "/api/osm/search") {
    const q = url.searchParams.get("q") ?? "";
    const lang = normalizeLang(url.searchParams.get("lang"));
    return json(await searchCity(env, q, lang));
  }

  if (request.method === "GET" && path === "/api/osm/areas") {
    const parentId = Number(url.searchParams.get("parentId"));
    const adminLevel = Number(url.searchParams.get("adminLevel"));
    const lang = normalizeLang(url.searchParams.get("lang"));
    if (!Number.isFinite(parentId) || !Number.isFinite(adminLevel)) {
      return fail("parentId and adminLevel are required.");
    }
    if (adminLevel < 8 || adminLevel > 10) {
      return fail("adminLevel must be between 8 and 10.");
    }
    return json(await getAreas(env, parentId, adminLevel, lang));
  }

  if (request.method === "GET" && path === "/api/osm/areas-in-view") {
    const adminLevel = Number(url.searchParams.get("adminLevel"));
    const s = Number(url.searchParams.get("s"));
    const w = Number(url.searchParams.get("w"));
    const n = Number(url.searchParams.get("n"));
    const e = Number(url.searchParams.get("e"));
    const lang = normalizeLang(url.searchParams.get("lang"));
    if (![adminLevel, s, w, n, e].every(Number.isFinite)) {
      return fail("adminLevel and bounds (s,w,n,e) are required.");
    }
    if (adminLevel < 8 || adminLevel > 10) {
      return fail("adminLevel must be between 8 and 10.");
    }
    return json(await getAreasInBounds(env, adminLevel, { s, w, n, e }, lang));
  }

  if (request.method === "POST" && path === "/api/lobby") {
    return await createLobby(request, env);
  }

  const joinMatch = path.match(/^\/api\/lobby\/([A-Za-z]{4})\/join$/);
  if (request.method === "POST" && joinMatch) {
    return await joinLobby(request, env, joinMatch[1].toUpperCase());
  }

  return fail("Not found.", 404);
}

async function createLobby(request: Request, env: Env): Promise<Response> {
  const body = (await request.json()) as CreateLobbyRequest;
  const { cacheKey, selectedAreaIds, params, teamName, customChallenges } = body;

  if (!cacheKey) return fail("Missing map data reference.");
  if (!Array.isArray(selectedAreaIds) || selectedAreaIds.length === 0) {
    return fail("Select at least one area for the game.");
  }
  if (selectedAreaIds.length > MAX_AREAS) {
    return fail(`Please select at most ${MAX_AREAS} areas.`);
  }
  if (!params || !Number.isFinite(params.timeLimitMs) || params.timeLimitMs <= 0) {
    return fail("Set a valid time limit.");
  }
  if (!Number.isFinite(params.openInPlay) || params.openInPlay < 2) {
    return fail("Open deck flop size must be at least 2.");
  }
  if (!Number.isFinite(params.privateDeckSize) || params.privateDeckSize < 0) {
    return fail("Private deck size (Y) can't be negative.");
  }
  const unlock = Number.isFinite(params.privateUnlockPeriodMs)
    ? params.privateUnlockPeriodMs
    : 0;
  if (unlock < 0) return fail("Private-area unlock period can't be negative.");
  if (unlock > 0 && unlock >= params.timeLimitMs) {
    return fail("The private-area unlock period must be less than the game time limit.");
  }
  if (params.openInPlay > selectedAreaIds.length) {
    return fail("Open deck size (X) can't exceed the number of selected areas.");
  }
  params.teamSize = params.teamSize === 2 ? 2 : 1;
  params.challengeLang = normalizeLang(params.challengeLang);

  // Sanitize optional host-supplied challenges: keep only selected areas with
  // non-empty text, capped to a sane length.
  let custom: Record<string, string> | undefined;
  if (customChallenges && typeof customChallenges === "object") {
    const selectedSet = new Set(selectedAreaIds);
    custom = {};
    for (const [id, text] of Object.entries(customChallenges)) {
      if (selectedSet.has(id) && typeof text === "string" && text.trim()) {
        custom[id] = text.trim().slice(0, 400);
      }
    }
    if (Object.keys(custom).length === 0) custom = undefined;
  }

  const full = await loadFullAreas(env, cacheKey, selectedAreaIds);
  const adjacency = computeAdjacency(full.map((a) => ({ id: a.id, geometry: a.geometry })));
  const areas: InitAreaInput[] = full.map((a) => ({
    id: a.id,
    name: a.name,
    centroid: a.centroid,
    geometry: simplifyGeometry(a.geometry),
  }));

  const hostTeam = {
    id: generateToken(),
    name: (teamName || "").trim().slice(0, 24) || "Host",
    color: nextColor([]),
    isHost: true,
    token: generateToken(),
  };

  let code = "";
  for (let attempt = 0; attempt < 12; attempt++) {
    const candidate = generateCode();
    const stub = env.LOBBY.get(env.LOBBY.idFromName(candidate));
    if (!(await stub.isInitialized())) {
      code = candidate;
      await stub.init({ code, areas, adjacency, params, hostTeam, customChallenges: custom });
      break;
    }
  }
  if (!code) return fail("Could not allocate a lobby code. Please try again.", 503);

  const res: CreateLobbyResponse = {
    code,
    teamId: hostTeam.id,
    token: hostTeam.token,
    color: hostTeam.color,
  };
  return json(res);
}

async function joinLobby(request: Request, env: Env, code: string): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as JoinLobbyRequest;
  const stub = env.LOBBY.get(env.LOBBY.idFromName(code));
  const result = await stub.join(body.teamName ?? "");
  if (!result.ok) return fail(result.error, result.status);
  const res: JoinLobbyResponse = {
    code,
    teamId: result.teamId,
    token: result.token,
    color: result.color,
  };
  return json(res);
}

async function handleWs(request: Request, env: Env, url: URL): Promise<Response> {
  const parts = url.pathname.split("/");
  const code = (parts[2] ?? "").toUpperCase();
  if (!/^[A-Z]{4}$/.test(code)) return new Response("Bad lobby code.", { status: 400 });
  if (request.headers.get("Upgrade") !== "websocket") {
    return new Response("Expected a WebSocket upgrade.", { status: 426 });
  }
  const stub = env.LOBBY.get(env.LOBBY.idFromName(code));
  return stub.fetch(request);
}
