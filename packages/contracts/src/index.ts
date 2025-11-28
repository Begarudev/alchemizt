export enum ServiceName {
  ApiGateway = "api-gateway",
  Auth = "auth-service",
  PlayerProfile = "player-profile-service",
  Puzzle = "puzzle-service",
  MatchOrchestrator = "match-orchestrator",
  Submission = "submission-service",
  Referee = "referee-service",
  Leaderboard = "leaderboard-service",
  Notification = "notification-service"
}

export type MatchEventType =
  | "room.join"
  | "room.leave"
  | "room.ready_state"
  | "match.countdown"
  | "match.start"
  | "match.progress"
  | "match.time_remaining"
  | "match.submission_result"
  | "match.results"
  | "match.rematch_offer";

export interface MatchEvent<TType extends MatchEventType = MatchEventType, TPayload = Record<string, unknown>> {
  readonly type: TType;
  readonly payload: TPayload;
  readonly roomId: string;
  readonly emittedAt: string;
}

export interface SubmissionEnvelope {
  readonly submissionId: string;
  readonly matchId: string;
  readonly userId: string;
  readonly pathwayId: string;
  readonly submittedAt: string;
  readonly refereeVersion: string;
}

export interface HealthReport {
  readonly service: ServiceName;
  readonly status: "ok" | "degraded" | "error";
  readonly region: string;
  readonly timestamp: string;
  readonly details?: Record<string, string | number | boolean>;
}

export interface RouteDefinition {
  readonly method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  readonly path: string;
  readonly description: string;
  readonly handledBy: ServiceName;
}

export type MatchMode = "speedrun" | "endurance" | "sandbox";

export type LadderDivision =
  | "Bronze"
  | "Argentum"
  | "Aurum"
  | "Platinum"
  | "Iridium"
  | "Philosopher";

export type DivisionTier = "V" | "IV" | "III" | "II" | "I";

export interface RatingDeltaPreview {
  readonly handle: string;
  readonly winChance: number;
  readonly expectedDelta: number;
  readonly winDelta: number;
  readonly lossDelta: number;
}

export interface LadderRatingSnapshot {
  readonly ladder: MatchMode;
  readonly rating: number;
  readonly deviation: number;
  readonly volatility: number;
  readonly matchesPlayed: number;
  readonly lastPlayedAt?: string;
  readonly provisionalMatches: number;
  readonly division: LadderDivision;
  readonly tier: DivisionTier;
}

export interface CompetitiveProfile {
  readonly handle: string;
  readonly region: string;
  readonly calibrationsRemaining: number;
  readonly hiddenRating: number;
  readonly ladders: Record<MatchMode, LadderRatingSnapshot>;
  readonly specializations: string[];
  readonly lastUpdated: string;
}

export type TicketStatus = "searching" | "matched" | "expired";

export interface MatchmakingTicketSummary {
  readonly ticketId: string;
  readonly handle: string;
  readonly mode: MatchMode;
  readonly rating: number;
  readonly deviation: number;
  readonly joinedAt: string;
  readonly waitSeconds: number;
  readonly spreadCap: number;
  readonly status: TicketStatus;
  readonly partyHandles?: string[];
  readonly isBot?: boolean;
}

export interface QueueModeSnapshot {
  readonly mode: MatchMode;
  readonly queueDepth: number;
  readonly averageRating: number;
  readonly longestWaitSeconds: number;
  readonly tickets: MatchmakingTicketSummary[];
}

export interface CompetitiveMatchPreview {
  readonly roomId: string;
  readonly mode: MatchMode;
  readonly handles: string[];
  readonly ratingSpread: number;
  readonly createdAt: string;
  readonly expectedDeltas: RatingDeltaPreview[];
  readonly botFilled?: boolean;
}

export interface CompetitiveDashboardPayload {
  readonly generatedAt: string;
  readonly profile?: CompetitiveProfile;
  readonly activeTicket?: MatchmakingTicketSummary;
  readonly queues: QueueModeSnapshot[];
  readonly pendingMatches: CompetitiveMatchPreview[];
}

export interface RoomCompetitiveContext {
  readonly isRated: boolean;
  readonly queueTicketIds?: string[];
  readonly ratingSpread?: number;
  readonly expectedDeltas?: RatingDeltaPreview[];
  readonly botFilled?: boolean;
}

export interface CountdownState {
  readonly state: "idle" | "pending" | "running" | "completed";
  readonly countdownSeconds: number;
  readonly startedAt?: string;
  readonly expiresAt?: string;
}

export interface RoomParticipant {
  readonly id: string;
  readonly handle: string;
  readonly role: "host" | "challenger" | "spectator";
  readonly ready: boolean;
}

export interface MatchRoom {
  readonly id: string;
  readonly puzzleId: string;
  readonly puzzleMetadata?: PuzzleMetadata;
  readonly mode: MatchMode;
  readonly websocketChannel: string;
  readonly participants: RoomParticipant[];
  readonly timerConfig: {
    readonly countdownSeconds: number;
    readonly totalSeconds: number;
  };
  readonly status: "lobby" | "countdown" | "in_progress";
  readonly countdown: CountdownState;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly competitive?: RoomCompetitiveContext;
}

export type PuzzleDifficulty = "practice" | "advanced" | "contest";

export interface PuzzleMetadata {
  readonly id: string;
  readonly title: string;
  readonly targetMolecule: string;
  readonly difficulty: PuzzleDifficulty;
  readonly estimatedSeconds: number;
  readonly referenceSteps: number;
  readonly referenceCost: number;
  readonly topicTags: string[];
  readonly theme: string;
  readonly allowedReactions: string[];
  readonly restrictedReagents?: string[];
  readonly modeAvailability: MatchMode[];
  readonly commonPitfalls: string[];
  readonly description?: string;
}

export interface PuzzleCatalogEntry {
  readonly metadata: PuzzleMetadata;
  readonly timerPreset: {
    readonly countdownSeconds: number;
    readonly totalSeconds: number;
  };
}

export type AnalyticsEventType =
  | "room.created"
  | "room.ready_toggled"
  | "room.countdown_started"
  | "match.result_recorded";

export interface AnalyticsEventBase<TType extends AnalyticsEventType, TPayload> {
  readonly type: TType;
  readonly occurredAt: string;
  readonly payload: TPayload;
}

export type RoomCreatedEvent = AnalyticsEventBase<
  "room.created",
  {
    readonly roomId: string;
    readonly puzzleId: string;
    readonly mode: MatchMode;
    readonly participantHandles: string[];
  }
>;

export type RoomReadyToggledEvent = AnalyticsEventBase<
  "room.ready_toggled",
  {
    readonly roomId: string;
    readonly participantId: string;
    readonly ready: boolean;
  }
>;

export type CountdownStartedEvent = AnalyticsEventBase<
  "room.countdown_started",
  {
    readonly roomId: string;
    readonly puzzleId: string;
    readonly countdownSeconds: number;
  }
>;

export type MatchResultRecordedEvent = AnalyticsEventBase<
  "match.result_recorded",
  {
    readonly roomId: string;
    readonly puzzleId: string;
    readonly winnerHandle: string;
    readonly durationSeconds: number;
  }
>;

export type AnalyticsEvent =
  | RoomCreatedEvent
  | RoomReadyToggledEvent
  | CountdownStartedEvent
  | MatchResultRecordedEvent;
