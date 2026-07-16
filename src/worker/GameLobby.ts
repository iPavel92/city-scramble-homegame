import { DurableObject } from "cloudflare:workers";
import { computeScores, determineWinners, type Adjacency } from "../shared/scoring";
import { nextColor } from "../shared/colors";
import type {
  Area,
  AreaGeometry,
  AreaPlacement,
  Claim,
  ClientMessage,
  DeckKind,
  GameParams,
  GamePhase,
  GameStateView,
  LngLat,
  ServerMessage,
  Team,
} from "../shared/types";
import { generateToken, partition } from "./decks";

const MAX_TEAMS = 10;

interface TeamRecord extends Team {
  token: string;
}

interface StoredAreaLite {
  name: string;
  centroid: LngLat;
  geometry: AreaGeometry;
}

export interface InitAreaInput {
  id: string;
  name: string;
  centroid: LngLat;
  geometry: AreaGeometry;
}

export interface InitPayload {
  code: string;
  areas: InitAreaInput[];
  adjacency: Adjacency;
  params: GameParams;
  hostTeam: TeamRecord;
}

export type JoinResult =
  | { ok: true; teamId: string; token: string; color: string }
  | { ok: false; error: string; status: number };

interface MetaState {
  code: string;
  phase: GamePhase;
  params: GameParams;
  teams: TeamRecord[];
  areaIds: string[];
  adjacency: Adjacency;
  hostTeamId: string;
  privateDecks: Record<string, string[]>;
  openQueue: string[];
  revealedCount: number;
  challenges: Record<string, string>;
  claims: Record<string, Claim>;
  startedAt?: number;
  endsAt?: number;
  winnerTeamIds?: string[];
}

interface Attachment {
  teamId?: string;
}

export class GameLobby extends DurableObject<Env> {
  private meta?: MetaState;
  private geom?: Map<string, StoredAreaLite>;

  private async ensureLoaded(): Promise<void> {
    if (this.meta) return;
    const meta = await this.ctx.storage.get<MetaState>("meta");
    if (!meta) return;
    this.meta = meta;
    const g = await this.ctx.storage.list<StoredAreaLite>({ prefix: "g:" });
    this.geom = new Map();
    for (const [k, v] of g) this.geom.set(k.slice(2), v);
  }

  private async persistMeta(): Promise<void> {
    if (this.meta) await this.ctx.storage.put("meta", this.meta);
  }

  // ---------------- RPC (called from the Worker) ----------------

  async isInitialized(): Promise<boolean> {
    await this.ensureLoaded();
    return !!this.meta;
  }

  async init(payload: InitPayload): Promise<void> {
    await this.ensureLoaded();
    if (this.meta) return; // idempotent — never clobber an existing lobby

    const geom = new Map<string, StoredAreaLite>();
    const batch: Record<string, unknown> = {};
    for (const a of payload.areas) {
      const lite: StoredAreaLite = { name: a.name, centroid: a.centroid, geometry: a.geometry };
      geom.set(a.id, lite);
      batch[`g:${a.id}`] = lite;
    }
    this.geom = geom;
    this.meta = {
      code: payload.code,
      phase: "lobby",
      params: payload.params,
      teams: [payload.hostTeam],
      areaIds: payload.areas.map((a) => a.id),
      adjacency: payload.adjacency,
      hostTeamId: payload.hostTeam.id,
      privateDecks: {},
      openQueue: [],
      revealedCount: 0,
      challenges: {},
      claims: {},
    };
    batch["meta"] = this.meta;
    await this.ctx.storage.put(batch); // single batched write (≤128 keys)
  }

  async join(teamNameRaw: string): Promise<JoinResult> {
    await this.ensureLoaded();
    if (!this.meta) return { ok: false, error: "Lobby not found.", status: 404 };
    if (this.meta.phase !== "lobby")
      return { ok: false, error: "This game has already started.", status: 409 };
    if (this.meta.teams.length >= MAX_TEAMS)
      return { ok: false, error: "This lobby is full.", status: 409 };

    const color = nextColor(this.meta.teams.map((t) => t.color));
    const team: TeamRecord = {
      id: generateToken(),
      name: (teamNameRaw || "").trim().slice(0, 24) || `Team ${this.meta.teams.length + 1}`,
      color,
      isHost: false,
      token: generateToken(),
    };
    this.meta.teams.push(team);
    await this.persistMeta();
    this.broadcastState();
    return { ok: true, teamId: team.id, token: team.token, color };
  }

  // ---------------- WebSocket lifecycle ----------------

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected a WebSocket upgrade.", { status: 426 });
    }
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    this.ctx.acceptWebSocket(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    await this.ensureLoaded();
    if (!this.meta) return this.sendErr(ws, "Lobby not found.");

    let msg: ClientMessage;
    try {
      const text = typeof message === "string" ? message : new TextDecoder().decode(message);
      msg = JSON.parse(text) as ClientMessage;
    } catch {
      return this.sendErr(ws, "Malformed message.");
    }

    if (msg.t === "hello") {
      const team = this.meta.teams.find((t) => t.token === msg.token);
      if (!team) return this.sendErr(ws, "Invalid session. Rejoin the lobby.");
      ws.serializeAttachment({ teamId: team.id } satisfies Attachment);
      return this.sendState(ws, team.id);
    }

    const att = ws.deserializeAttachment() as Attachment | null;
    const teamId = att?.teamId;
    if (!teamId) return this.sendErr(ws, "Not authenticated.");

    if (msg.t === "start") return this.handleStart(teamId, ws);
    if (msg.t === "claim") return this.handleClaim(teamId, msg.areaId, ws);
  }

  async webSocketClose(ws: WebSocket, code: number): Promise<void> {
    try {
      ws.close(code, "closing");
    } catch {
      /* already closed */
    }
  }

  async alarm(): Promise<void> {
    await this.ensureLoaded();
    await this.finishGame();
  }

  /** End the game: compute winners, cancel any pending timer, broadcast. */
  private async finishGame(): Promise<void> {
    const m = this.meta;
    if (!m || m.phase !== "active") return;
    m.phase = "ended";
    const scores = computeScores(
      m.teams.map((t) => t.id),
      Object.values(m.claims),
      m.adjacency,
    );
    m.winnerTeamIds = determineWinners(scores);
    await this.ctx.storage.deleteAlarm();
    await this.persistMeta();
    this.broadcastState();
  }

  // ---------------- Game actions ----------------

  private async handleStart(teamId: string, ws: WebSocket): Promise<void> {
    const m = this.meta!;
    if (teamId !== m.hostTeamId) return this.sendErr(ws, "Only the host can start the game.");
    if (m.phase !== "lobby") return this.sendErr(ws, "The game has already started.");
    try {
      const layout = partition(
        m.areaIds,
        m.teams.map((t) => t.id),
        m.params,
      );
      m.privateDecks = layout.privateDecks;
      m.openQueue = layout.openQueue;
      m.revealedCount = layout.revealedCount;
      m.challenges = layout.challenges;
      m.phase = "active";
      m.startedAt = Date.now();
      m.endsAt = m.startedAt + m.params.timeLimitMs;
      await this.ctx.storage.setAlarm(m.endsAt);
      await this.persistMeta();
      this.broadcastState();
    } catch (e) {
      this.sendErr(ws, (e as Error).message);
    }
  }

  private async handleClaim(teamId: string, areaId: string, ws: WebSocket): Promise<void> {
    const m = this.meta!;
    if (m.phase !== "active") return this.sendErr(ws, "The game is not active.");
    if (m.claims[areaId]) return this.sendErr(ws, "That area is already claimed.");
    if (!this.isClaimableBy(areaId, teamId))
      return this.sendErr(ws, "You can't claim that area right now.");

    m.claims[areaId] = { areaId, teamId, at: Date.now() };
    // Reveal the next open-deck area if a revealed open area was just taken.
    const openIdx = m.openQueue.indexOf(areaId);
    if (openIdx >= 0 && openIdx < m.revealedCount && m.revealedCount < m.openQueue.length) {
      m.revealedCount++;
    }

    if (Object.keys(m.claims).length >= m.areaIds.length) {
      // Every area has been claimed — end the game immediately.
      await this.finishGame();
    } else {
      await this.persistMeta();
      this.broadcastState();
    }
  }

  private isClaimableBy(areaId: string, teamId: string): boolean {
    const m = this.meta!;
    if (m.claims[areaId]) return false;
    const openIdx = m.openQueue.indexOf(areaId);
    if (openIdx >= 0 && openIdx < m.revealedCount) return true;
    return (m.privateDecks[teamId] ?? []).includes(areaId);
  }

  // ---------------- View projection + broadcast ----------------

  private privateOwners(): Record<string, string> {
    const owner: Record<string, string> = {};
    for (const [tid, ids] of Object.entries(this.meta!.privateDecks)) {
      for (const id of ids) owner[id] = tid;
    }
    return owner;
  }

  private viewFor(teamId: string): GameStateView {
    const m = this.meta!;
    const owner = this.privateOwners();
    const revealedOpen = new Set(m.openQueue.slice(0, m.revealedCount));
    const areas: Area[] = [];
    const placements: AreaPlacement[] = [];

    for (const id of m.areaIds) {
      // Every player receives the geometry for ALL areas so the full game board
      // is always visible as outlines. Placement (deck/owner/challenge/claim) is
      // still visibility-filtered below.
      const g = this.geom?.get(id);
      if (g) areas.push({ id, name: g.name, centroid: g.centroid, geometry: g.geometry });

      const claim = m.claims[id];
      const ownerTeamId = owner[id];
      const deck: DeckKind = ownerTeamId ? "private" : "open";
      let visible = false;
      let claimable = false;
      let challenge: string | undefined;

      if (claim) {
        visible = true; // claimed areas are visible to everyone
      } else if (deck === "open" && revealedOpen.has(id)) {
        visible = true;
        claimable = m.phase === "active";
        challenge = m.challenges[id];
      } else if (deck === "private" && ownerTeamId === teamId) {
        visible = true;
        claimable = m.phase === "active";
        challenge = m.challenges[id];
      }
      if (!visible) continue;

      placements.push({
        areaId: id,
        deck,
        ownerTeamId: deck === "private" ? ownerTeamId : undefined,
        claimable,
        challenge: claimable ? challenge : undefined,
        claim,
      });
    }

    const scores = computeScores(
      m.teams.map((t) => t.id),
      Object.values(m.claims),
      m.adjacency,
    );

    return {
      code: m.code,
      phase: m.phase,
      params: m.params,
      teams: m.teams.map((t) => ({
        id: t.id,
        name: t.name,
        color: t.color,
        isHost: t.isHost,
      })),
      youTeamId: teamId,
      areas,
      placements,
      scores,
      openDeckRemaining: Math.max(0, m.openQueue.length - m.revealedCount),
      startedAt: m.startedAt,
      endsAt: m.endsAt,
      serverNow: Date.now(),
      winnerTeamIds: m.winnerTeamIds,
    };
  }

  private broadcastState(): void {
    for (const ws of this.ctx.getWebSockets()) {
      const att = ws.deserializeAttachment() as Attachment | null;
      if (att?.teamId) this.sendState(ws, att.teamId);
    }
  }

  private sendState(ws: WebSocket, teamId: string): void {
    const msg: ServerMessage = { t: "state", state: this.viewFor(teamId) };
    this.safeSend(ws, msg);
  }

  private sendErr(ws: WebSocket, message: string): void {
    this.safeSend(ws, { t: "error", message });
  }

  private safeSend(ws: WebSocket, msg: ServerMessage): void {
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      /* socket gone */
    }
  }
}
