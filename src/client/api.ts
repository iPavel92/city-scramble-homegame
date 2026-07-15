import type {
  CreateLobbyRequest,
  CreateLobbyResponse,
  JoinLobbyResponse,
  OsmAreasResponse,
  OsmSearchResult,
} from "../shared/types";

async function req<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || `Request failed (${res.status}).`);
  }
  return data as T;
}

export const api = {
  search: (q: string) =>
    req<OsmSearchResult[]>(`/api/osm/search?q=${encodeURIComponent(q)}`),

  areas: (parentId: number, adminLevel: number) =>
    req<OsmAreasResponse>(`/api/osm/areas?parentId=${parentId}&adminLevel=${adminLevel}`),

  createLobby: (body: CreateLobbyRequest) =>
    req<CreateLobbyResponse>(`/api/lobby`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),

  joinLobby: (code: string, teamName: string) =>
    req<JoinLobbyResponse>(`/api/lobby/${code}/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teamName }),
    }),
};
