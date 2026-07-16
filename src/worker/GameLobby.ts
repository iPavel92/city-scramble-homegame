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
  RedrawView,
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

/** In-progress protect → replace exchange triggered by an open-deck claim. */
interface RedrawState {
  claimerTeamId: string;
  /** teamId → protected areaId (only teams other than the claimer). */
  protectedBy: Record<string, string>;
  stage: "protecting" | "replacing";
}

interface MetaState {
  code: string;
  phase: GamePhase;
  params: GameParams;
  teams: TeamRecord[];
  areaIds: string[];
  adjacency: Adjacency;
  hostTeamId: string;
  privateDecks: Record<string, string[]>;
  /** How many private areas (per team) are currently unlocked/on the map. */
  privateUnlockedCount: number;
  /** Open-deck areas currently in play (unclaimed). */
  flop: string[];
  /** Remaining open-deck areas; drawn from the front, returned to the back. */
  deck: string[];
  challenges: Record<string, string>;
  claims: Record<string, Claim>;
  redraw: RedrawState | null;
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

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // Auto-answer client "ping" keepalives with "pong" without waking the DO,
    // so idle sockets (e.g. a claimer waiting for others) aren't dropped.
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

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
      privateUnlockedCount: 0,
      flop: [],
      deck: [],
      challenges: {},
      claims: {},
      redraw: null,
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
    if (msg.t === "protect") return this.handleProtect(teamId, msg.areaId, ws);
    if (msg.t === "replace") return this.handleReplace(teamId, msg.areaId, ws);
  }

  async webSocketClose(ws: WebSocket, code: number): Promise<void> {
    try {
      ws.close(code, "closing");
    } catch {
      /* already closed */
    }
  }

  /** Soonest of: the next private-area unlock (if pending) and the game end. */
  private nextAlarmTarget(m: MetaState): number {
    const period = m.params.privateUnlockPeriodMs ?? 0;
    const Y = m.params.privateDeckSize;
    let target = m.endsAt ?? 0;
    if (period > 0 && m.privateUnlockedCount < Y && m.startedAt !== undefined) {
      const nextUnlockAt = m.startedAt + m.privateUnlockedCount * period;
      if (nextUnlockAt < target) target = nextUnlockAt;
    }
    return target;
  }

  async alarm(): Promise<void> {
    await this.ensureLoaded();
    const m = this.meta;
    if (!m || m.phase !== "active") return;

    const now = Date.now();
    const period = m.params.privateUnlockPeriodMs ?? 0;
    const Y = m.params.privateDeckSize;

    // Unlock any private areas whose time has come (robust to delayed alarms).
    let unlockedNew = false;
    if (period > 0 && m.privateUnlockedCount < Y && m.startedAt !== undefined) {
      const should = Math.min(Y, 1 + Math.floor((now - m.startedAt) / period));
      if (should > m.privateUnlockedCount) {
        m.privateUnlockedCount = should;
        unlockedNew = true;
      }
    }

    if (m.endsAt !== undefined && now >= m.endsAt) {
      return this.finishGame();
    }

    await this.ctx.storage.setAlarm(this.nextAlarmTarget(m));
    await this.persistMeta();
    if (unlockedNew) this.broadcastState();
  }

  /** End the game: compute winners, cancel any pending timer, broadcast. */
  private async finishGame(): Promise<void> {
    const m = this.meta;
    if (!m || m.phase !== "active") return;
    m.phase = "ended";
    m.redraw = null;
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
    if (m.teams.length < 2)
      return this.sendErr(ws, "You need at least one other team to start.");
    try {
      const layout = partition(
        m.areaIds,
        m.teams.map((t) => t.id),
        m.params,
      );
      m.privateDecks = layout.privateDecks;
      m.flop = layout.flop;
      m.deck = layout.deck;
      m.challenges = layout.challenges;
      m.phase = "active";
      m.startedAt = Date.now();
      m.endsAt = m.startedAt + m.params.timeLimitMs;
      // Staggered private unlock: only the first private area starts on the map
      // when a period is set; otherwise all are unlocked immediately.
      const Y = m.params.privateDeckSize;
      m.privateUnlockedCount =
        (m.params.privateUnlockPeriodMs ?? 0) > 0 ? Math.min(1, Y) : Y;
      await this.ctx.storage.setAlarm(this.nextAlarmTarget(m));
      await this.persistMeta();
      this.broadcastState();
    } catch (e) {
      this.sendErr(ws, (e as Error).message);
    }
  }

  private async handleClaim(teamId: string, areaId: string, ws: WebSocket): Promise<void> {
    const m = this.meta!;
    if (m.phase !== "active") return this.sendErr(ws, "The game is not active.");
    if (m.redraw) return this.sendErr(ws, "Hold on — a protect/replace exchange is in progress.");
    if (m.claims[areaId]) return this.sendErr(ws, "That area is already claimed.");
    if (!this.isClaimableBy(areaId, teamId))
      return this.sendErr(ws, "You can't claim that area right now.");

    const wasOpen = m.flop.includes(areaId);
    m.claims[areaId] = { areaId, teamId, at: Date.now() };

    if (wasOpen) {
      m.flop = m.flop.filter((a) => a !== areaId);
      // Draw a new area into the flop to keep it topped up.
      if (m.deck.length > 0) m.flop.push(m.deck.shift()!);
    }

    if (Object.keys(m.claims).length >= m.areaIds.length) {
      // Every area has been claimed — end the game immediately.
      return this.finishGame();
    }

    // Trigger the protect → replace exchange after ANY claim (open or private),
    // provided there are other teams to protect and a fresh area to draw.
    const otherTeams = m.teams.filter((t) => t.id !== teamId);
    if (otherTeams.length >= 1 && m.flop.length >= 1 && m.deck.length >= 1) {
      m.redraw = { claimerTeamId: teamId, protectedBy: {}, stage: "protecting" };
    }

    await this.persistMeta();
    this.broadcastState();
  }

  private async handleProtect(teamId: string, areaId: string, ws: WebSocket): Promise<void> {
    const m = this.meta!;
    const r = m.redraw;
    if (!r || r.stage !== "protecting") return this.sendErr(ws, "There's nothing to protect now.");
    if (teamId === r.claimerTeamId)
      return this.sendErr(ws, "The claiming team doesn't protect.");
    if (r.protectedBy[teamId]) return this.sendErr(ws, "You already protected an area.");
    if (!m.flop.includes(areaId))
      return this.sendErr(ws, "Protect an area that is currently in play.");

    r.protectedBy[teamId] = areaId;

    // Wait until every other team (roster) has protected.
    const otherTeams = m.teams.filter((t) => t.id !== r.claimerTeamId);
    const allProtected = otherTeams.every((t) => r.protectedBy[t.id] !== undefined);
    if (allProtected) {
      const protectedSet = new Set(Object.values(r.protectedBy));
      const unprotected = m.flop.filter((a) => !protectedSet.has(a));
      if (unprotected.length === 0) {
        m.redraw = null; // everything protected — no replacement possible
      } else {
        r.stage = "replacing";
      }
    }

    await this.persistMeta();
    this.broadcastState();
  }

  private async handleReplace(teamId: string, areaId: string, ws: WebSocket): Promise<void> {
    const m = this.meta!;
    const r = m.redraw;
    if (!r || r.stage !== "replacing") return this.sendErr(ws, "There's nothing to replace now.");
    if (teamId !== r.claimerTeamId)
      return this.sendErr(ws, "Only the claiming team replaces an area.");
    const protectedSet = new Set(Object.values(r.protectedBy));
    if (!m.flop.includes(areaId) || protectedSet.has(areaId))
      return this.sendErr(ws, "Pick an unprotected area that is in play.");

    // Remove from the flop, draw a fresh area, and return this one to the deck.
    m.flop = m.flop.filter((a) => a !== areaId);
    if (m.deck.length > 0) m.flop.push(m.deck.shift()!);
    m.deck.push(areaId);
    m.redraw = null;

    await this.persistMeta();
    this.broadcastState();
  }

  private isClaimableBy(areaId: string, teamId: string): boolean {
    const m = this.meta!;
    if (m.claims[areaId]) return false;
    if (m.flop.includes(areaId)) return true;
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

  private redrawViewFor(teamId: string): RedrawView | null {
    const m = this.meta!;
    const r = m.redraw;
    if (!r) return null;
    const isClaimer = teamId === r.claimerTeamId;
    const protectedVals = Object.values(r.protectedBy);
    const protectedSet = new Set(protectedVals);
    const otherTeams = m.teams.filter((t) => t.id !== r.claimerTeamId);
    const pendingCount = otherTeams.filter((t) => r.protectedBy[t.id] === undefined).length;

    let youRole: RedrawView["youRole"] = "waiting";
    let actionableAreaIds: string[] = [];
    if (isClaimer) {
      if (r.stage === "replacing") {
        youRole = "claimer";
        actionableAreaIds = m.flop.filter((a) => !protectedSet.has(a));
      }
    } else if (r.stage === "protecting" && r.protectedBy[teamId] === undefined) {
      youRole = "protector";
      actionableAreaIds = [...m.flop];
    }

    return {
      stage: r.stage,
      claimerTeamId: r.claimerTeamId,
      youRole,
      actionableAreaIds,
      // Reveal protected markings only once we reach the replacing stage.
      protectedAreaIds: r.stage === "replacing" ? [...new Set(protectedVals)] : [],
      pendingCount,
    };
  }

  private viewFor(teamId: string): GameStateView {
    const m = this.meta!;
    const owner = this.privateOwners();
    const flopSet = new Set(m.flop);
    const areas: Area[] = [];
    const placements: AreaPlacement[] = [];
    const canClaim = m.phase === "active" && !m.redraw;

    for (const id of m.areaIds) {
      const claim = m.claims[id];
      const ownerTeamId = owner[id];

      // Locked (not-yet-unlocked) private areas are hidden from everyone.
      if (ownerTeamId && !claim) {
        const idx = m.privateDecks[ownerTeamId]?.indexOf(id) ?? -1;
        if (idx < 0 || idx >= m.privateUnlockedCount) continue;
      }

      // Every player receives the geometry for all on-board areas so the game
      // area is visible as outlines. Placement is visibility-filtered below.
      const g = this.geom?.get(id);
      if (g) areas.push({ id, name: g.name, centroid: g.centroid, geometry: g.geometry });

      const deck: DeckKind = ownerTeamId ? "private" : "open";
      let visible = false;
      let claimable = false;
      let challenge: string | undefined;

      if (claim) {
        visible = true; // claimed areas are visible to everyone
      } else if (deck === "open" && flopSet.has(id)) {
        visible = true;
        claimable = canClaim;
        challenge = m.challenges[id];
      } else if (deck === "private" && ownerTeamId === teamId) {
        visible = true;
        claimable = canClaim;
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

    const period = m.params.privateUnlockPeriodMs ?? 0;
    const Y = m.params.privateDeckSize;
    let nextPrivateUnlockAt: number | undefined;
    if (
      m.phase === "active" &&
      period > 0 &&
      m.privateUnlockedCount < Y &&
      m.startedAt !== undefined &&
      m.endsAt !== undefined
    ) {
      const t = m.startedAt + m.privateUnlockedCount * period;
      if (t < m.endsAt) nextPrivateUnlockAt = t;
    }

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
      flopAreaIds: [...m.flop],
      scores,
      openDeckRemaining: m.deck.length,
      redraw: this.redrawViewFor(teamId),
      startedAt: m.startedAt,
      endsAt: m.endsAt,
      nextPrivateUnlockAt,
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
