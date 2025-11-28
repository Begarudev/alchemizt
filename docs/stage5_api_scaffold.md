# Stage 5 API Scaffold

The initial scaffold mirrors the services described in `stage5_architecture.md`. It supplies:

- pnpm workspace wiring (`package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`).
- Shared type contracts (`packages/contracts`).
- Shared HTTP helpers (`packages/http-kit`) that wrap Express with JSON parsing, request logging, `/health`, `/routes`, and typed bootstrap helpers.
- One Express entrypoint per service under `services/*` with strict TypeScript builds and domain-flavoured placeholder routes.

## Local Development

```bash
pnpm install
pnpm start:all   # frees reserved ports then launches everything
```

The helper script above ensures ports `4000-4008` and `5173+` are available before kicking off `pnpm dev`. You can still run the raw command if you prefer:

```bash
pnpm dev
```

Running either command spawns `tsx` watchers for every service plus `tsc -w` for shared packages, so imports always resolve to fresh builds. Individual services can be built or started with:

```bash
pnpm --filter @alchemizt/<service-name> build
pnpm --filter @alchemizt/<service-name> start
```

## Health Checks & Contracts

Every service currently provides:

- `GET /health` — returns a typed `HealthReport` that upstream load balancers can probe.
- `GET /` — describes the service responsibility pulled from the architecture doc so teams can confirm wiring quickly.
- `GET /routes` — advertises every domain route (method, path, handler) exported by that process.

Shared enums (`ServiceName`) and interfaces (`MatchEvent`, `RouteDefinition`, `SubmissionEnvelope`, `MatchRoom`, `RoomParticipant`, `CountdownState`) live in `packages/contracts`. Services should import these rather than redefining domain shapes. `packages/http-kit` centralizes middleware such as request logging, async error handling, standardized health responses, and optional CORS.

## Prototype Vertical Slice

To validate the Stage 5 orchestration flows early, we added a prototype slice:

- **Match Orchestrator (`services/match-orchestrator`)**
  - `POST /rooms` — create a room with puzzle + timer metadata.
  - `POST /rooms/:roomId/join` — add a participant with a role.
  - `POST /rooms/:roomId/ready` — toggle readiness per participant.
  - `POST /rooms/:roomId/countdown` — start or reset countdown state.
  - `GET /rooms/:roomId` / `GET /rooms` — inspect individual or aggregate room state.
  - Uses the new shared contracts so other services/clients can rely on consistent payloads.
- **Frontend Shell (`apps/frontend-shell`)**
  - React + Vite SPA powered by TanStack Router/Query and Zustand.
  - Polls the orchestrator, exposes forms for each prototype action, and visualizes lobby state.
  - React Compiler lint/babel plugins are enabled to keep components compatible with future compiler builds.

See `docs/prototype_service_frontend_plan.md` for the detailed scope and follow-up work.

Example verification flow:

```bash
pnpm --filter @alchemizt/api-gateway build
pnpm --filter @alchemizt/api-gateway start &
curl -s http://localhost:4000/edge/routes | jq
```

## Next Steps

- Continue enriching service-specific routers/controllers per the architecture responsibilities.
- Add shared middleware (logging, tracing, auth) that can be reused by multiple services.
- Expand the frontend shell to integrate additional services (puzzle metadata, submissions, leaderboards).
- Introduce integration tests that compose the HTTP surfaces and gRPC stubs described in the Stage 5 plan.
