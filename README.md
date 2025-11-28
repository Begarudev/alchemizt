# Alchemizt Stage 5 Platform

This repository hosts the Stage 5 service scaffold. Each domain service described in `docs/stage5_architecture.md` is represented by a dedicated TypeScript Express process, wired together through a pnpm workspace for future shared tooling.

## Getting Started

1. Install dependencies: `pnpm install`
2. Run all services in watch mode: `pnpm dev`
3. To work with a specific service, `cd services/<service>` and use `pnpm dev`, `pnpm build`, or `pnpm start`.

## Service Map

| Service | Port | Responsibilities |
| --- | --- | --- |
| api-gateway | 4000 | TLS termination, auth delegation, routing |
| auth-service | 4001 | OAuth handoff, session/token issuance |
| player-profile-service | 4002 | Profiles, ratings, personalization |
| puzzle-service | 4003 | Puzzle CRUD, contest pools, schedules |
| match-orchestrator | 4004 | Lobbies, countdowns, WebSockets |
| submission-service | 4005 | Submission intake, persistence |
| referee-service | 4006 | Chemistry validation & scoring |
| leaderboard-service | 4007 | Aggregations and ladder publication |
| notification-service | 4008 | Email/push notifications |

Each service now exposes `/`, `/health`, and `/routes` plus a minimal set of domain-specific endpoints inspired by the Stage 5 architecture (room orchestration, contest CRUD, submissions, etc.). See `docs/stage5_api_scaffold.md` for the full matrix.

## Shared Contracts

The `packages/contracts` workspace contains shared enums and data contracts (e.g., `MatchEvent`, `HealthReport`, `RouteDefinition`). Import these types to ensure strict typing between services.

## Shared HTTP Toolkit

`packages/http-kit` hosts an Express bootstrapper plus common middleware (request logging, async handler, error handler). Services call `createServiceApp(...)` to inherit `/health`, `/routes`, JSON parsing, and standardized logging before registering their own routers.

When running `pnpm dev`, both `contracts` and `http-kit` run `tsc -w`, so downstream services always import the latest compiled output.
