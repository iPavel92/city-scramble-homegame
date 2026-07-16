// Shared types used by both the Worker (server) and the React client.
// Geometry is a minimal GeoJSON subset so the client needs no GeoJSON types.

/** [lng, lat] as used by GeoJSON. */
export type LngLat = [number, number];

export interface AreaGeometry {
  type: "Polygon" | "MultiPolygon";
  /** Polygon: number[][][]  |  MultiPolygon: number[][][][] */
  coordinates: number[][][] | number[][][][];
}

/** An administrative area as rendered on the client (simplified geometry). */
export interface Area {
  /** Stable id, e.g. "R123456" = OSM relation 123456. */
  id: string;
  name: string;
  centroid: LngLat;
  geometry: AreaGeometry;
}

export type DeckKind = "open" | "private";

export type GamePhase = "lobby" | "active" | "ended";

export interface Team {
  id: string;
  name: string;
  /** Hex color, e.g. "#e6194b". */
  color: string;
  isHost: boolean;
}

export interface GameParams {
  /** Total game duration in milliseconds. */
  timeLimitMs: number;
  /** Y — number of private areas dealt to each team. */
  privateDeckSize: number;
  /** X — number of open-deck areas revealed (in play) at any time. */
  openInPlay: number;
}

export interface Claim {
  areaId: string;
  teamId: string;
  at: number;
}

/** Placement/visibility of one area, already filtered for the receiving team. */
export interface AreaPlacement {
  areaId: string;
  deck: DeckKind;
  /** Present for private-deck areas. */
  ownerTeamId?: string;
  /** Currently claimable by the receiving team (open in-play, or own private). */
  claimable: boolean;
  /** Challenge text — present only when the area is claimable by this team. */
  challenge?: string;
  /** Present once the area has been claimed by any team. */
  claim?: Claim;
}

/** Per-team view of an in-progress redraw (protect → replace) exchange. */
export interface RedrawView {
  stage: "protecting" | "replacing";
  claimerTeamId: string;
  /** What the receiving team should do right now. */
  youRole: "claimer" | "protector" | "waiting";
  /** Areas the receiving team may act on now (protect, or replace if claimer). */
  actionableAreaIds: string[];
  /** Areas already protected — shown as markings during the replacing stage. */
  protectedAreaIds: string[];
  /** How many teams still need to protect (during the protecting stage). */
  pendingCount: number;
}

export interface ScoreEntry {
  teamId: string;
  /** Size of the team's largest connected cluster of adjacent claimed areas. */
  largestCluster: number;
  /** Total number of areas claimed by the team. */
  totalClaimed: number;
}

/** Full, visibility-filtered snapshot the server sends to a single team. */
export interface GameStateView {
  code: string;
  phase: GamePhase;
  params: GameParams;
  teams: Team[];
  youTeamId: string;
  /** Geometry for every area currently visible to this team. */
  areas: Area[];
  placements: AreaPlacement[];
  /** Open-deck areas currently in play (unclaimed), used for reveal/removal cues. */
  flopAreaIds: string[];
  scores: ScoreEntry[];
  /** Number of open-deck areas not yet drawn into play (public info). */
  openDeckRemaining: number;
  /** In-progress protect/replace exchange, or null. */
  redraw: RedrawView | null;
  startedAt?: number;
  endsAt?: number;
  /** Server clock at send time, for countdown offset correction. */
  serverNow: number;
  /** Winning team id(s), present when phase === "ended". */
  winnerTeamIds?: string[];
}

// ---- OSM wizard payloads ----

export interface OsmSearchResult {
  name: string;
  displayName: string;
  osmType: "R" | "W" | "N";
  osmId: number;
  adminLevel: number | null;
  /** [south, north, west, east]. */
  boundingBox: [number, number, number, number];
  center: LngLat;
}

export interface OsmAreaFeature {
  id: string;
  name: string;
  centroid: LngLat;
  geometry: AreaGeometry;
}

export interface OsmAreasResponse {
  /** Cache key the client passes back to /api/lobby to avoid re-uploading geometry. */
  cacheKey: string;
  adminLevel: number;
  areas: OsmAreaFeature[];
  attribution: string;
}

export interface CreateLobbyRequest {
  cacheKey: string;
  selectedAreaIds: string[];
  params: GameParams;
  teamName: string;
}

export interface CreateLobbyResponse {
  code: string;
  teamId: string;
  token: string;
  color: string;
}

export interface JoinLobbyRequest {
  teamName: string;
}

export interface JoinLobbyResponse {
  code: string;
  teamId: string;
  token: string;
  color: string;
}

// ---- WebSocket protocol ----

export type ClientMessage =
  | { t: "hello"; token: string }
  | { t: "start" }
  | { t: "claim"; areaId: string }
  | { t: "protect"; areaId: string }
  | { t: "replace"; areaId: string };

export type ServerMessage =
  | { t: "state"; state: GameStateView }
  | { t: "error"; message: string };
