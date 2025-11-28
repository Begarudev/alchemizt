import type {
  CompetitiveDashboardPayload,
  MatchMode,
  MatchRoom,
  MatchmakingTicketSummary,
  PuzzleCatalogEntry,
  RoomParticipant,
} from "@alchemizt/contracts";

const normalizeBaseUrl = (value: string): string => {
  if (!value) {
    return "";
  }
  return value.endsWith("/") ? value.slice(0, -1) : value;
};

export const MATCH_SERVICE_URL = normalizeBaseUrl(
  import.meta.env.VITE_MATCH_SERVICE_URL ?? "http://localhost:4004",
);

const jsonRequest = async <TResponse>(
  path: string,
  init?: RequestInit,
): Promise<TResponse> => {
  const response = await fetch(`${MATCH_SERVICE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request to ${path} failed with ${response.status}`);
  }

  return (await response.json()) as TResponse;
};

export interface CreateRoomPayload {
  readonly hostHandle: string;
  readonly hostUserId?: string;
  readonly puzzleId: string;
  readonly mode: MatchMode;
}

export interface JoinRoomPayload {
  readonly handle: string;
  readonly role?: RoomParticipant["role"];
  readonly userId?: string;
}

export interface EnqueueMatchmakingPayload {
  readonly handle: string;
  readonly mode: MatchMode;
  readonly partyHandles?: string[];
}

export interface MatchResultPayload {
  readonly winnerHandle: string;
  readonly loserHandle: string;
  readonly mode: MatchMode;
  readonly puzzleTier?: "standard" | "advanced" | "elite";
  readonly refereeConfidence?: number;
  readonly timeRemainingSeconds?: number;
}

export const fetchRooms = () => jsonRequest<{ rooms: MatchRoom[] }>("/rooms");

export const fetchPuzzleCatalog = () => jsonRequest<{ puzzles: PuzzleCatalogEntry[] }>("/puzzles");

export const fetchPuzzleById = (puzzleId: string) => jsonRequest<PuzzleCatalogEntry>(`/puzzles/${puzzleId}`);

export const createRoom = (payload: CreateRoomPayload) =>
  jsonRequest<MatchRoom>("/rooms", {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const joinRoom = (roomId: string, payload: JoinRoomPayload) =>
  jsonRequest<MatchRoom>(`/rooms/${roomId}/join`, {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const toggleReady = (roomId: string, participantId: string, ready?: boolean) =>
  jsonRequest<MatchRoom>(`/rooms/${roomId}/ready`, {
    method: "POST",
    body: JSON.stringify({
      participantId,
      ready,
    }),
  });

export const startCountdown = (roomId: string) =>
  jsonRequest<MatchRoom>(`/rooms/${roomId}/countdown`, {
    method: "POST",
    body: JSON.stringify({ action: "start" }),
  });

export const fetchCompetitiveDashboard = (handle?: string) => {
  const query = handle ? `?handle=${encodeURIComponent(handle)}` : "";
  return jsonRequest<CompetitiveDashboardPayload>(`/competitive/dashboard${query}`);
};

export const enqueueMatchmaking = (payload: EnqueueMatchmakingPayload) =>
  jsonRequest<{ ticket: MatchmakingTicketSummary; dashboard: CompetitiveDashboardPayload }>(
    "/matchmaking/enqueue",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );

export const cancelMatchmakingTicket = (ticketId: string) =>
  jsonRequest<{ cancelled: boolean }>(`/matchmaking/tickets/${ticketId}/cancel`, {
    method: "POST",
  });

export const submitMatchResult = (roomId: string, payload: MatchResultPayload) =>
  jsonRequest(`/competitive/matches/${roomId}/result`, {
    method: "POST",
    body: JSON.stringify(payload),
  });

