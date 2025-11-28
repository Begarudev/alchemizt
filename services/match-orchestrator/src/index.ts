import { randomUUID } from "node:crypto";
import type { Response } from "express";
import {
  CompetitiveDashboardPayload,
  CompetitiveMatchPreview,
  CompetitiveProfile,
  CountdownState,
  DivisionTier,
  LadderDivision,
  LadderRatingSnapshot,
  MatchMode,
  MatchRoom,
  MatchmakingTicketSummary,
  QueueModeSnapshot,
  RatingDeltaPreview,
  RouteDefinition,
  RoomCompetitiveContext,
  RoomParticipant,
  ServiceName,
  TicketStatus,
} from "@alchemizt/contracts";
import { createServiceApp } from "@alchemizt/http-kit";
import { getPuzzleById, listPuzzles } from "./puzzleCatalog.js";
import {
  recordCountdownStarted,
  recordMatchResult,
  recordReadyToggled,
  recordRoomCreated,
} from "./analyticsLogger.js";

const routes: RouteDefinition[] = [
  {
    method: "POST",
    path: "/rooms",
    description: "Create a match room",
    handledBy: ServiceName.MatchOrchestrator,
  },
  {
    method: "POST",
    path: "/rooms/:roomId/ready",
    description: "Toggle ready state for a participant",
    handledBy: ServiceName.MatchOrchestrator,
  },
  {
    method: "POST",
    path: "/rooms/:roomId/countdown",
    description: "Start an authoritative countdown",
    handledBy: ServiceName.MatchOrchestrator,
  },
  {
    method: "POST",
    path: "/rooms/:roomId/join",
    description: "Join a match room with a specific role",
    handledBy: ServiceName.MatchOrchestrator,
  },
  {
    method: "GET",
    path: "/rooms/:roomId",
    description: "Inspect the current room state",
    handledBy: ServiceName.MatchOrchestrator,
  },
  {
    method: "GET",
    path: "/rooms",
    description: "List all active prototype rooms",
    handledBy: ServiceName.MatchOrchestrator,
  },
  {
    method: "GET",
    path: "/puzzles",
    description: "List all Stage 10 puzzle catalog entries",
    handledBy: ServiceName.MatchOrchestrator,
  },
  {
    method: "GET",
    path: "/puzzles/:puzzleId",
    description: "Inspect a single puzzle catalog entry",
    handledBy: ServiceName.MatchOrchestrator,
  },
  {
    method: "POST",
    path: "/matchmaking/enqueue",
    description: "Enter a player into the competitive matchmaking queue",
    handledBy: ServiceName.MatchOrchestrator,
  },
  {
    method: "POST",
    path: "/matchmaking/tickets/:ticketId/cancel",
    description: "Cancel an active matchmaking ticket",
    handledBy: ServiceName.MatchOrchestrator,
  },
  {
    method: "GET",
    path: "/matchmaking/snapshot",
    description: "Return queue state across all ladders",
    handledBy: ServiceName.MatchOrchestrator,
  },
  {
    method: "GET",
    path: "/competitive/dashboard",
    description: "Return ladder, rating, and queue data for the UI",
    handledBy: ServiceName.MatchOrchestrator,
  },
  {
    method: "POST",
    path: "/competitive/matches/:roomId/result",
    description: "Apply a competitive match result and update ratings",
    handledBy: ServiceName.MatchOrchestrator,
  },
];

const activeRooms = new Map<string, MatchRoom>();

const nowIso = (): string => new Date().toISOString();

const defaultCountdown = (countdownSeconds: number): CountdownState => ({
  state: "idle",
  countdownSeconds,
});

const upsertRoom = (room: MatchRoom): MatchRoom => {
  const stampedRoom = { ...room, updatedAt: nowIso() };
  activeRooms.set(stampedRoom.id, stampedRoom);
  return stampedRoom;
};

const getRoomOr404 = (roomId: string, res: Response) => {
  const room = activeRooms.get(roomId);
  if (!room) {
    res.status(404).json({ error: "room_not_found", roomId });
    return null;
  }
  return room;
};

const buildParticipant = ({
  userId,
  handle,
  role,
}: {
  userId?: string;
  handle: string;
  role?: RoomParticipant["role"];
}): RoomParticipant => ({
  id: userId ?? randomUUID(),
  handle,
  role: role ?? "challenger",
  ready: false,
});

const DEFAULT_RATING = 1500;
const DEFAULT_RD = 350;
const DEFAULT_VOLATILITY = 0.06;
const MAX_RD = 400;
const MIN_RD = 35;
const MATCH_HISTORY_LIMIT = 12;
const MATCHMAKING_MODES: MatchMode[] = ["speedrun", "endurance", "sandbox"];
const MVP_ROOM_MODES: MatchMode[] = ["speedrun", "endurance"];
const DEFAULT_PUZZLE_ID = listPuzzles()[0]?.metadata.id ?? "pz-carbonyl-01";
const DIVISION_CONFIG: Array<{ division: LadderDivision; floor: number; ceiling: number }> = [
  { division: "Bronze", floor: 0, ceiling: 1199 },
  { division: "Argentum", floor: 1200, ceiling: 1399 },
  { division: "Aurum", floor: 1400, ceiling: 1599 },
  { division: "Platinum", floor: 1600, ceiling: 1799 },
  { division: "Iridium", floor: 1800, ceiling: 1999 },
  { division: "Philosopher", floor: 2000, ceiling: 2400 },
];
const DIVISION_TIERS: DivisionTier[] = ["V", "IV", "III", "II", "I"];
const BOT_HANDLES = ["chem-bot-flux", "chem-bot-helix", "chem-bot-sol", "chem-bot-vial"];

interface LadderRecordState {
  ladder: MatchMode;
  rating: number;
  deviation: number;
  volatility: number;
  matchesPlayed: number;
  provisionalMatches: number;
  lastPlayedAtMs?: number;
}

interface ProfileRecordState {
  handle: string;
  region: string;
  calibrationsRemaining: number;
  hiddenRating: number;
  specializations: string[];
  ladders: Record<MatchMode, LadderRecordState>;
  lastUpdatedMs: number;
}

interface MatchmakingTicketInternal {
  ticketId: string;
  handle: string;
  mode: MatchMode;
  rating: number;
  deviation: number;
  joinedAtMs: number;
  status: TicketStatus;
  partyHandles: string[];
  isBot?: boolean;
  matchedAtMs?: number;
}

const profileStore = new Map<string, ProfileRecordState>();
const matchmakingTickets = new Map<string, MatchmakingTicketInternal>();
const ticketsByHandle = new Map<string, string>();
const queueByMode: Record<MatchMode, MatchmakingTicketInternal[]> = {
  speedrun: [],
  endurance: [],
  sandbox: [],
};
const pendingCompetitiveMatches: CompetitiveMatchPreview[] = [];

const pickDivisionTier = (rating: number): { division: LadderDivision; tier: DivisionTier } => {
  const config =
    DIVISION_CONFIG.find((entry) => rating >= entry.floor && rating <= entry.ceiling) ??
    DIVISION_CONFIG[DIVISION_CONFIG.length - 1];
  const span = config.ceiling === Infinity ? 200 : config.ceiling - config.floor;
  const clampedSpan = span > 0 ? span : 200;
  const relative = Math.min(Math.max(rating - config.floor, 0), clampedSpan);
  const tierIndex = Math.max(
    0,
    Math.min(
      DIVISION_TIERS.length - 1,
      DIVISION_TIERS.length - 1 - Math.floor((relative / clampedSpan) * DIVISION_TIERS.length),
    ),
  );
  return { division: config.division, tier: DIVISION_TIERS[tierIndex] };
};

const getOrCreateProfile = (handle: string): ProfileRecordState => {
  const normalized = handle.trim().toLowerCase();
  const existing = profileStore.get(normalized);
  if (existing) {
    return existing;
  }
  const ladderDefaults = MATCHMAKING_MODES.reduce<Record<MatchMode, LadderRecordState>>(
    (acc, mode) => {
      acc[mode] = {
        ladder: mode,
        rating: DEFAULT_RATING,
        deviation: DEFAULT_RD,
        volatility: DEFAULT_VOLATILITY,
        matchesPlayed: 0,
        provisionalMatches: 5,
      };
      return acc;
    },
    {} as Record<MatchMode, LadderRecordState>,
  );
  const profile: ProfileRecordState = {
    handle: normalized,
    region: "NA",
    calibrationsRemaining: 3,
    hiddenRating: DEFAULT_RATING + Math.round(Math.random() * 60 - 30),
    specializations: ["Organometallic", "Photoredox"].slice(0, 1 + Math.floor(Math.random() * 2)),
    ladders: ladderDefaults,
    lastUpdatedMs: Date.now(),
  };
  profileStore.set(normalized, profile);
  return profile;
};

const inflateDeviationForIdle = (ladder: LadderRecordState) => {
  if (!ladder.lastPlayedAtMs) {
    return;
  }
  const weeksIdle = Math.floor((Date.now() - ladder.lastPlayedAtMs) / (7 * 24 * 60 * 60 * 1000));
  if (weeksIdle <= 0) {
    return;
  }
  const inflated = ladder.deviation * Math.min(1 + weeksIdle * 0.02, MAX_RD / ladder.deviation);
  ladder.deviation = Math.min(MAX_RD, inflated);
};

const computeWinChance = (ratingA: number, ratingB: number) =>
  1 / (1 + 10 ** ((ratingB - ratingA) / 400));

const computeKFactor = (ladder: LadderRecordState, mode: MatchMode) => {
  const rdScalar = Math.min(1.5, Math.max(0.5, ladder.deviation / 200));
  const modeScalar = mode === "endurance" ? 1.1 : mode === "sandbox" ? 0.25 : 1;
  return 24 * rdScalar * modeScalar;
};

const buildRatingPreview = (
  a: MatchmakingTicketInternal,
  b: MatchmakingTicketInternal,
): RatingDeltaPreview[] => {
  const winChanceA = computeWinChance(a.rating, b.rating);
  const winChanceB = computeWinChance(b.rating, a.rating);
  const kA = computeKFactor(
    {
      ladder: a.mode,
      rating: a.rating,
      deviation: a.deviation,
      volatility: DEFAULT_VOLATILITY,
      matchesPlayed: 0,
      provisionalMatches: 0,
    },
    a.mode,
  );
  const kB = computeKFactor(
    {
      ladder: b.mode,
      rating: b.rating,
      deviation: b.deviation,
      volatility: DEFAULT_VOLATILITY,
      matchesPlayed: 0,
      provisionalMatches: 0,
    },
    b.mode,
  );
  const winDeltaA = Number((kA * (1 - winChanceA)).toFixed(1));
  const lossDeltaA = Number((-kA * winChanceA).toFixed(1));
  const winDeltaB = Number((kB * (1 - winChanceB)).toFixed(1));
  const lossDeltaB = Number((-kB * winChanceB).toFixed(1));
  return [
    {
      handle: a.handle,
      winChance: Number(winChanceA.toFixed(2)),
      expectedDelta: Number(((winDeltaA + lossDeltaA) / 2).toFixed(1)),
      winDelta: winDeltaA,
      lossDelta: lossDeltaA,
    },
    {
      handle: b.handle,
      winChance: Number(winChanceB.toFixed(2)),
      expectedDelta: Number(((winDeltaB + lossDeltaB) / 2).toFixed(1)),
      winDelta: winDeltaB,
      lossDelta: lossDeltaB,
    },
  ];
};

const summarizeLadder = (ladder: LadderRecordState): LadderRatingSnapshot => {
  const { division, tier } = pickDivisionTier(ladder.rating);
  return {
    ladder: ladder.ladder,
    rating: Math.round(ladder.rating),
    deviation: Math.round(ladder.deviation),
    volatility: Number(ladder.volatility.toFixed(4)),
    matchesPlayed: ladder.matchesPlayed,
    lastPlayedAt: ladder.lastPlayedAtMs ? new Date(ladder.lastPlayedAtMs).toISOString() : undefined,
    provisionalMatches: Math.max(0, ladder.provisionalMatches),
    division,
    tier,
  };
};

const buildProfilePayload = (profile: ProfileRecordState): CompetitiveProfile => ({
  handle: profile.handle,
  region: profile.region,
  calibrationsRemaining: profile.calibrationsRemaining,
  hiddenRating: profile.hiddenRating,
  specializations: profile.specializations,
  ladders: {
    speedrun: summarizeLadder(profile.ladders.speedrun),
    endurance: summarizeLadder(profile.ladders.endurance),
    sandbox: summarizeLadder(profile.ladders.sandbox),
  },
  lastUpdated: new Date(profile.lastUpdatedMs).toISOString(),
});

const toTicketSummary = (ticket: MatchmakingTicketInternal): MatchmakingTicketSummary => {
  const waitSeconds = Math.round((Date.now() - ticket.joinedAtMs) / 1000);
  const spreadCap =
    ticket.mode === "sandbox"
      ? 400
      : waitSeconds >= 90
        ? 360
        : waitSeconds >= 60
          ? 280
          : waitSeconds >= 30
            ? 200
            : 120;
  return {
    ticketId: ticket.ticketId,
    handle: ticket.handle,
    mode: ticket.mode,
    rating: Math.round(ticket.rating),
    deviation: Math.round(ticket.deviation),
    joinedAt: new Date(ticket.joinedAtMs).toISOString(),
    waitSeconds,
    spreadCap,
    status: ticket.status,
    partyHandles: ticket.partyHandles.length > 0 ? ticket.partyHandles : undefined,
    isBot: ticket.isBot,
  };
};

const computeSpreadCap = (ticket: MatchmakingTicketInternal) => {
  const waitSeconds = Math.round((Date.now() - ticket.joinedAtMs) / 1000);
  if (ticket.mode === "sandbox") {
    return 400;
  }
  if (waitSeconds >= 90) {
    return 360;
  }
  if (waitSeconds >= 60) {
    return 280;
  }
  if (waitSeconds >= 30) {
    return 200;
  }
  return 120;
};

interface EnqueueOptions {
  readonly partyHandles?: string[];
  readonly isBot?: boolean;
  readonly ratingOverride?: number;
  readonly deviationOverride?: number;
}

const enqueueTicket = (handle: string, mode: MatchMode, options?: EnqueueOptions): MatchmakingTicketInternal => {
  const normalized = options?.isBot ? handle : handle.trim().toLowerCase();
  if (!options?.isBot) {
    const existingTicketId = ticketsByHandle.get(normalized);
    if (existingTicketId) {
      const existing = matchmakingTickets.get(existingTicketId);
      if (existing) {
        return existing;
      }
    }
  }
  const profile = getOrCreateProfile(normalized);
  const ladder = profile.ladders[mode];
  inflateDeviationForIdle(ladder);
  const effectiveRating =
    options?.ratingOverride ??
    (profile.calibrationsRemaining > 0 ? profile.hiddenRating : ladder.rating);
  const deviation = options?.deviationOverride ?? ladder.deviation;
  const ticket: MatchmakingTicketInternal = {
    ticketId: `ticket_${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`,
    handle: normalized,
    mode,
    rating: Math.round(effectiveRating),
    deviation,
    joinedAtMs: Date.now(),
    status: "searching",
    partyHandles: options?.partyHandles ?? [],
    isBot: options?.isBot,
  };
  queueByMode[mode].push(ticket);
  matchmakingTickets.set(ticket.ticketId, ticket);
  if (!options?.isBot) {
    ticketsByHandle.set(normalized, ticket.ticketId);
  }
  return ticket;
};

const cancelTicket = (ticketId: string): boolean => {
  const ticket = matchmakingTickets.get(ticketId);
  if (!ticket || ticket.status !== "searching") {
    return false;
  }
  ticket.status = "expired";
  queueByMode[ticket.mode] = queueByMode[ticket.mode].filter((entry) => entry.ticketId !== ticketId);
  matchmakingTickets.delete(ticketId);
  if (!ticket.isBot) {
    ticketsByHandle.delete(ticket.handle);
  }
  return true;
};

const ensureBotForMode = (mode: MatchMode) => {
  const queue = queueByMode[mode].filter((ticket) => ticket.status === "searching");
  if (queue.length === 0) {
    return;
  }
  const longestWait = Math.max(...queue.map((ticket) => (Date.now() - ticket.joinedAtMs) / 1000));
  const hasBot = queue.some((ticket) => ticket.isBot);
  if (hasBot || longestWait < 45) {
    return;
  }
  const averageRating = queue.reduce((sum, ticket) => sum + ticket.rating, 0) / queue.length;
  const botHandle = `${
    BOT_HANDLES[Math.floor(Math.random() * BOT_HANDLES.length)]
  }-${mode}-${Math.floor(Math.random() * 1000)}`;
  enqueueTicket(botHandle, mode, {
    isBot: true,
    ratingOverride: Math.round(averageRating - 60),
    deviationOverride: 65,
  });
};

const createRatedRoomFromTickets = (
  mode: MatchMode,
  a: MatchmakingTicketInternal,
  b: MatchmakingTicketInternal,
  ratingSpread: number,
) => {
  const countdownSeconds = mode === "endurance" ? 8 : 5;
  const totalSeconds = mode === "endurance" ? 900 : 300;
  const puzzleId =
    mode === "sandbox" ? "pz_sandbox_queue" : mode === "endurance" ? "pz_endurance_prime" : "pz_speed_alpha";
  const roomId = `rated_${Date.now()}_${Math.floor(Math.random() * 10_000)}`;
  const timestamp = nowIso();
  const participants = [
    buildParticipant({ handle: a.handle, role: "host" }),
    buildParticipant({ handle: b.handle, role: "challenger" }),
  ];
  const expectedDeltas = buildRatingPreview(a, b);
  const competitive: RoomCompetitiveContext = {
    isRated: mode !== "sandbox",
    queueTicketIds: [a.ticketId, b.ticketId],
    ratingSpread,
    expectedDeltas,
    botFilled: Boolean(a.isBot || b.isBot),
  };
  const room: MatchRoom = {
    id: roomId,
    puzzleId,
    mode,
    websocketChannel: `match:${roomId}`,
    participants,
    timerConfig: {
      countdownSeconds,
      totalSeconds,
    },
    status: "lobby",
    countdown: defaultCountdown(countdownSeconds),
    createdAt: timestamp,
    updatedAt: timestamp,
    competitive,
  };
  upsertRoom(room);
  pendingCompetitiveMatches.unshift({
    roomId,
    mode,
    handles: participants.map((entry) => entry.handle),
    ratingSpread,
    createdAt: timestamp,
    expectedDeltas,
    botFilled: competitive.botFilled,
  });
  if (pendingCompetitiveMatches.length > MATCH_HISTORY_LIMIT) {
    pendingCompetitiveMatches.pop();
  }
};

const processQueueForMode = (mode: MatchMode) => {
  ensureBotForMode(mode);
  const queue = queueByMode[mode].filter((ticket) => ticket.status === "searching");
  queue.sort((a, b) => a.rating - b.rating);
  const claimed = new Set<string>();
  for (let i = 0; i < queue.length; i += 1) {
    const ticket = queue[i];
    if (claimed.has(ticket.ticketId)) {
      continue;
    }
    const spreadA = computeSpreadCap(ticket);
    for (let j = i + 1; j < queue.length; j += 1) {
      const candidate = queue[j];
      if (claimed.has(candidate.ticketId)) {
        continue;
      }
      const spreadB = computeSpreadCap(candidate);
      const allowedSpread = Math.min(spreadA, spreadB);
      const ratingSpread = Math.abs(ticket.rating - candidate.rating);
      if (ratingSpread <= allowedSpread) {
        claimed.add(ticket.ticketId);
        claimed.add(candidate.ticketId);
        ticket.status = "matched";
        candidate.status = "matched";
        ticket.matchedAtMs = Date.now();
        candidate.matchedAtMs = ticket.matchedAtMs;
        if (!ticket.isBot) {
          ticketsByHandle.delete(ticket.handle);
        }
        if (!candidate.isBot) {
          ticketsByHandle.delete(candidate.handle);
        }
        createRatedRoomFromTickets(mode, ticket, candidate, allowedSpread);
        break;
      }
    }
  }
  queueByMode[mode] = queueByMode[mode].filter((ticket) => ticket.status === "searching");
};

const runMatchmaking = () => {
  MATCHMAKING_MODES.forEach((mode) => processQueueForMode(mode));
};

const buildQueueSnapshots = (): QueueModeSnapshot[] =>
  MATCHMAKING_MODES.map((mode) => {
    const queue = queueByMode[mode].filter((ticket) => ticket.status === "searching");
    const queueDepth = queue.length;
    const tickets = queue
      .slice()
      .sort((a, b) => a.joinedAtMs - b.joinedAtMs)
      .map(toTicketSummary)
      .slice(0, 6);
    const averageRating =
      queueDepth === 0 ? 0 : Math.round(queue.reduce((sum, ticket) => sum + ticket.rating, 0) / queueDepth);
    const longestWaitSeconds =
      queueDepth === 0 ? 0 : Math.max(...queue.map((ticket) => Math.round((Date.now() - ticket.joinedAtMs) / 1000)));
    return {
      mode,
      queueDepth,
      averageRating,
      longestWaitSeconds,
      tickets,
    };
  });

const buildDashboardPayload = (handle?: string): CompetitiveDashboardPayload => {
  runMatchmaking();
  const normalizedHandle = handle?.trim().toLowerCase();
  const profile = normalizedHandle ? buildProfilePayload(getOrCreateProfile(normalizedHandle)) : undefined;
  const activeTicketId = normalizedHandle ? ticketsByHandle.get(normalizedHandle) : undefined;
  const ticketEntry =
    activeTicketId && matchmakingTickets.get(activeTicketId)?.status === "searching"
      ? matchmakingTickets.get(activeTicketId)
      : undefined;
  const activeTicket = ticketEntry ? toTicketSummary(ticketEntry) : undefined;
  return {
    generatedAt: nowIso(),
    profile,
    activeTicket,
    queues: buildQueueSnapshots(),
    pendingMatches: pendingCompetitiveMatches.slice(0, MATCH_HISTORY_LIMIT),
  };
};

interface MatchResolutionPayload {
  winnerHandle: string;
  loserHandle: string;
  mode: MatchMode;
  puzzleTier?: "standard" | "advanced" | "elite";
  refereeConfidence?: number;
  timeRemainingSeconds?: number;
}

const computeContextScalar = ({
  mode,
  puzzleTier,
  timeRemainingSeconds,
  refereeConfidence,
}: MatchResolutionPayload): number => {
  const puzzleScalar = puzzleTier === "elite" ? 1.25 : puzzleTier === "advanced" ? 1.1 : 1;
  const timeScalar =
    typeof timeRemainingSeconds === "number" ? 1 + Math.max(-0.2, Math.min(0.2, timeRemainingSeconds / 300)) : 1;
  const confidenceScalar = refereeConfidence ?? 0.92;
  const modeScalar = mode === "sandbox" ? 0.2 : mode === "endurance" ? 1.1 : 1;
  return puzzleScalar * timeScalar * confidenceScalar * modeScalar;
};

const applyRatingDelta = (
  handle: string,
  outcome: 1 | 0,
  opponentHandle: string,
  payload: MatchResolutionPayload,
): RatingDeltaPreview => {
  const profile = getOrCreateProfile(handle);
  const opponentProfile = getOrCreateProfile(opponentHandle);
  const ladder = profile.ladders[payload.mode];
  const opponentLadder = opponentProfile.ladders[payload.mode];
  inflateDeviationForIdle(ladder);
  inflateDeviationForIdle(opponentLadder);
  const winChance = computeWinChance(ladder.rating, opponentLadder.rating);
  const baseK = computeKFactor(ladder, payload.mode);
  const contextScalar = computeContextScalar(payload);
  let delta = Number(((outcome - winChance) * baseK * contextScalar).toFixed(2));
  if (payload.mode === "sandbox") {
    delta = Math.max(-5, Math.min(5, delta));
  }
  const projectedWinDelta = Number((baseK * contextScalar * (1 - winChance)).toFixed(2));
  const projectedLossDelta = Number((-baseK * contextScalar * winChance).toFixed(2));
  ladder.rating = Math.round(ladder.rating + delta);
  ladder.deviation = Math.min(MAX_RD, Math.max(MIN_RD, ladder.deviation * 0.92));
  ladder.matchesPlayed += 1;
  ladder.provisionalMatches = Math.max(0, ladder.provisionalMatches - 1);
  ladder.lastPlayedAtMs = Date.now();
  profile.calibrationsRemaining = Math.max(0, profile.calibrationsRemaining - 1);
  profile.lastUpdatedMs = Date.now();
  if (Math.abs(delta) > baseK * 0.8) {
    ladder.volatility = Math.min(0.35, ladder.volatility * 1.05);
  } else {
    ladder.volatility = Math.max(0.02, ladder.volatility * 0.98);
  }
  return {
    handle,
    winChance: Number(winChance.toFixed(2)),
    expectedDelta: delta,
    winDelta: projectedWinDelta,
    lossDelta: projectedLossDelta,
  };
};

const applyMatchResult = (roomId: string, payload: MatchResolutionPayload) => {
  const winnerDelta = applyRatingDelta(payload.winnerHandle, 1, payload.loserHandle, payload);
  const loserDelta = applyRatingDelta(payload.loserHandle, 0, payload.winnerHandle, payload);
  const deltas: RatingDeltaPreview[] = [winnerDelta, loserDelta];
  const room = activeRooms.get(roomId);
  if (room?.competitive?.queueTicketIds) {
    room.competitive.queueTicketIds.forEach((ticketId) => matchmakingTickets.delete(ticketId));
  }
  if (room) {
    const nextCompetitive: RoomCompetitiveContext = room.competitive
      ? { ...room.competitive, expectedDeltas: deltas }
      : { isRated: false, expectedDeltas: deltas };
    activeRooms.set(roomId, {
      ...room,
      status: "in_progress",
      countdown: { ...room.countdown, state: "running", startedAt: nowIso() },
      competitive: nextCompetitive,
    });
  }
  const matchIndex = pendingCompetitiveMatches.findIndex((entry) => entry.roomId === roomId);
  if (matchIndex >= 0) {
    pendingCompetitiveMatches[matchIndex] = {
      ...pendingCompetitiveMatches[matchIndex],
      expectedDeltas: deltas,
    };
  }
  return {
    roomId,
    mode: payload.mode,
    appliedAt: nowIso(),
    deltas,
    profiles: [payload.winnerHandle, payload.loserHandle].map((handle) =>
      buildProfilePayload(getOrCreateProfile(handle)),
    ),
  };
};

const applyReadyState = (room: MatchRoom, participantId: string, readyFlag?: boolean): MatchRoom => {
  const participants = room.participants.map((participant: RoomParticipant) => {
    if (participant.id !== participantId) {
      return participant;
    }
    const nextReady = readyFlag ?? !participant.ready;
    return { ...participant, ready: nextReady };
  });
  const readyCount = participants.filter((participant: RoomParticipant) => participant.ready).length;
  const readyPercent = participants.length === 0 ? 0 : Math.round((readyCount / participants.length) * 100);

  let countdownState: CountdownState = room.countdown;
  let status: MatchRoom["status"] = room.status;

  if (readyPercent === 100 && room.countdown.state === "idle") {
    countdownState = { ...room.countdown, state: "pending" };
    status = "countdown";
  } else if (readyPercent < 100 && room.countdown.state !== "running") {
    countdownState = { ...room.countdown, state: "idle" };
    status = "lobby";
  }

  return {
    ...room,
    participants,
    countdown: countdownState,
    status,
  };
};

const service = createServiceApp({
  serviceName: ServiceName.MatchOrchestrator,
  summary: "Lobby state, room timers, and WebSocket session orchestration",
  defaultPort: 4004,
  enableCors: true,
  routes,
  register: (router) => {
    router.get("/puzzles", (_req, res) => {
      res.json({ puzzles: listPuzzles() });
    });

    router.get("/puzzles/:puzzleId", (req, res) => {
      const puzzleId = (req.params.puzzleId ?? "").trim();
      const entry = getPuzzleById(puzzleId);
      if (!entry) {
        res.status(404).json({ error: "puzzle_not_found", puzzleId });
        return;
      }
      res.json(entry);
    });

    router.post("/rooms", (req, res) => {
      const requestBody = (req.body ?? {}) as Partial<{
        hostHandle: string;
        mode: MatchMode;
        puzzleId: string;
        hostUserId: string;
      }>;
      const requestedMode: MatchMode =
        typeof requestBody.mode === "string" && MATCHMAKING_MODES.includes(requestBody.mode as MatchMode)
          ? (requestBody.mode as MatchMode)
          : "speedrun";
      if (!MVP_ROOM_MODES.includes(requestedMode)) {
        res.status(400).json({ error: "mode_not_permitted", allowedModes: MVP_ROOM_MODES });
        return;
      }
      const requestedPuzzleId =
        typeof requestBody.puzzleId === "string" && requestBody.puzzleId.trim().length > 0
          ? requestBody.puzzleId.trim()
          : DEFAULT_PUZZLE_ID;
      const puzzleEntry = getPuzzleById(requestedPuzzleId);
      if (!puzzleEntry) {
        res.status(400).json({ error: "puzzle_not_found", puzzleId: requestedPuzzleId });
        return;
      }
      if (!puzzleEntry.metadata.modeAvailability.includes(requestedMode)) {
        res.status(400).json({
          error: "puzzle_mode_not_available",
          allowedModes: puzzleEntry.metadata.modeAvailability,
        });
        return;
      }

      const hostHandle =
        typeof requestBody.hostHandle === "string" && requestBody.hostHandle.trim().length > 0
          ? requestBody.hostHandle.trim()
          : "host";

      const roomId = `room_${Date.now()}`;
      const timestamp = nowIso();
      const { countdownSeconds, totalSeconds } = puzzleEntry.timerPreset;

      const hostParticipant = buildParticipant({
        handle: hostHandle,
        role: "host",
        userId: requestBody?.hostUserId,
      });

      const room: MatchRoom = {
        id: roomId,
        puzzleId: puzzleEntry.metadata.id,
        puzzleMetadata: puzzleEntry.metadata,
        mode: requestedMode,
        websocketChannel: `match:${roomId}`,
        participants: [hostParticipant],
        timerConfig: {
          countdownSeconds,
          totalSeconds,
        },
        status: "lobby",
        countdown: defaultCountdown(countdownSeconds),
        createdAt: timestamp,
        updatedAt: timestamp,
      };

      upsertRoom(room);
      recordRoomCreated({
        roomId,
        puzzleId: room.puzzleId,
        mode: room.mode,
        participantHandles: room.participants.map((participant) => participant.handle),
      });
      res.status(201).json(room);
    });

    router.post("/rooms/:roomId/ready", (req, res) => {
      const room = getRoomOr404(req.params.roomId, res);
      if (!room) {
        return;
      }
      const participantId = req.body?.participantId ?? room.participants[0]?.id;
      if (!participantId) {
        res.status(400).json({ error: "participant_required" });
        return;
      }

      const updatedRoom = applyReadyState(room, participantId, req.body?.ready);
      upsertRoom(updatedRoom);
      const toggledParticipant = updatedRoom.participants.find((entry) => entry.id === participantId);
      if (toggledParticipant) {
        recordReadyToggled({
          roomId: updatedRoom.id,
          participantId,
          ready: toggledParticipant.ready,
        });
      }
      res.json(updatedRoom);
    });

    router.post("/rooms/:roomId/countdown", (req, res) => {
      const room = getRoomOr404(req.params.roomId, res);
      if (!room) {
        return;
      }
      const action: "start" | "reset" = req.body?.action ?? "start";
      let countdown: CountdownState = room.countdown;
      let status: MatchRoom["status"] = room.status;

      if (action === "start") {
        countdown = {
          countdownSeconds: room.timerConfig.countdownSeconds,
          state: "running",
          startedAt: nowIso(),
          expiresAt: new Date(Date.now() + room.timerConfig.countdownSeconds * 1000).toISOString(),
        };
        status = "in_progress";
      } else if (action === "reset") {
        countdown = defaultCountdown(room.timerConfig.countdownSeconds);
        status = "lobby";
      }

      const updatedRoom: MatchRoom = {
        ...room,
        countdown,
        status,
      };
      upsertRoom(updatedRoom);
      if (action === "start") {
        recordCountdownStarted({
          roomId: updatedRoom.id,
          puzzleId: updatedRoom.puzzleId,
          countdownSeconds: countdown.countdownSeconds,
        });
      }
      res.json(updatedRoom);
    });

    router.post("/rooms/:roomId/join", (req, res) => {
      const room = getRoomOr404(req.params.roomId, res);
      if (!room) {
        return;
      }
      const handle: string | undefined = req.body?.handle;
      if (!handle) {
        res.status(400).json({ error: "handle_required" });
        return;
      }

      const existingParticipant = room.participants.find((participant: RoomParticipant) => participant.handle === handle);
      if (existingParticipant) {
        res.json(room);
        return;
      }

      const newParticipant = buildParticipant({
        handle,
        role: req.body?.role,
        userId: req.body?.userId,
      });

      const updatedRoom: MatchRoom = {
        ...room,
        participants: [...room.participants, newParticipant],
        status: "lobby",
        countdown: defaultCountdown(room.timerConfig.countdownSeconds),
      };
      upsertRoom(updatedRoom);
      res.status(201).json(updatedRoom);
    });

    router.get("/rooms/:roomId", (req, res) => {
      const room = getRoomOr404(req.params.roomId, res);
      if (!room) {
        return;
      }
      res.json(room);
    });

    router.get("/rooms", (_req, res) => {
      res.json({ rooms: Array.from(activeRooms.values()) });
    });

    router.post("/matchmaking/enqueue", (req, res) => {
      const handle: string | undefined = req.body?.handle;
      const mode: MatchMode = req.body?.mode ?? "speedrun";
      if (!handle) {
        res.status(400).json({ error: "handle_required" });
        return;
      }
      if (!MATCHMAKING_MODES.includes(mode)) {
        res.status(400).json({ error: "invalid_mode" });
        return;
      }
      const ticket = enqueueTicket(handle, mode, {
        partyHandles: Array.isArray(req.body?.partyHandles) ? req.body.partyHandles : [],
      });
      runMatchmaking();
      res.status(201).json({
        ticket: toTicketSummary(ticket),
        dashboard: buildDashboardPayload(handle),
      });
    });

    router.post("/matchmaking/tickets/:ticketId/cancel", (req, res) => {
      const cancelled = cancelTicket(req.params.ticketId);
      if (!cancelled) {
        res.status(404).json({ error: "ticket_not_found" });
        return;
      }
      res.json({ cancelled: true });
    });

    router.get("/matchmaking/snapshot", (_req, res) => {
      res.json({
        generatedAt: nowIso(),
        queues: buildQueueSnapshots(),
        pendingMatches: pendingCompetitiveMatches.slice(0, MATCH_HISTORY_LIMIT),
      });
    });

    router.get("/competitive/dashboard", (req, res) => {
      const handle = typeof req.query.handle === "string" ? req.query.handle : undefined;
      const payload: CompetitiveDashboardPayload = buildDashboardPayload(handle);
      res.json(payload);
    });

    router.post("/competitive/matches/:roomId/result", (req, res) => {
      const winnerHandle: string | undefined = req.body?.winnerHandle;
      const loserHandle: string | undefined = req.body?.loserHandle;
      const mode: MatchMode = req.body?.mode ?? "speedrun";
      if (!winnerHandle || !loserHandle) {
        res.status(400).json({ error: "winner_and_loser_required" });
        return;
      }
      if (!MATCHMAKING_MODES.includes(mode)) {
        res.status(400).json({ error: "invalid_mode" });
        return;
      }
      const normalizedWinner = winnerHandle.trim().toLowerCase();
      const normalizedLoser = loserHandle.trim().toLowerCase();
      const payload = applyMatchResult(req.params.roomId, {
        winnerHandle: normalizedWinner,
        loserHandle: normalizedLoser,
        mode,
        puzzleTier: req.body?.puzzleTier,
        refereeConfidence: req.body?.refereeConfidence,
        timeRemainingSeconds: req.body?.timeRemainingSeconds,
      });
      const room = activeRooms.get(req.params.roomId);
      const durationSeconds =
        typeof req.body?.durationSeconds === "number"
          ? req.body.durationSeconds
          : typeof room?.timerConfig.totalSeconds === "number"
            ? Math.max(
                0,
                room.timerConfig.totalSeconds - (Number(req.body?.timeRemainingSeconds) || 0),
              )
            : 0;
      recordMatchResult({
        roomId: req.params.roomId,
        puzzleId: room?.puzzleId ?? req.body?.puzzleId ?? "unknown",
        winnerHandle: normalizedWinner,
        durationSeconds,
      });
      res.json(payload);
    });
  },
});

service.start();
