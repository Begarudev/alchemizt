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
}
