## Prototype Service & Frontend Shell Plan

This plan distills the Stage 5 architecture (`docs/stage5_architecture.md`) and scaffold notes (`docs/stage5_api_scaffold.md`, `README.md`) into a concrete vertical slice we can implement immediately.

### Objectives
1. **Prototype Service (Match Orchestrator focus)**  
   Deliver a stateful HTTP surface that models lobby creation, readiness tracking, and countdown control so other services and clients can exercise realistic flows without full infra.
2. **Frontend Shell (Vite React SPA)**  
   Provide a minimal client that can discover prototype rooms, create new ones, and observe readiness/countdown states. This shell becomes the playground for user experience work before the full SPA lands.

### Scope for the First Iteration
- In-memory room registry with metadata required by downstream services (puzzle selection, timer config, participants).
- REST endpoints:
  - `POST /rooms` (create room with puzzle + timer presets)
  - `POST /rooms/:roomId/join` (add participant + optional role)
  - `POST /rooms/:roomId/ready` (toggle readiness)
  - `POST /rooms/:roomId/countdown` (start/stop countdown, emit mock timeline)
  - `GET /rooms/:roomId` + `GET /rooms` (inspect room roster & state)
- JSON payloads typed via new `@alchemizt/contracts` interfaces (`MatchRoom`, `RoomParticipant`, `CountdownState`, `MatchCountdownEvent`).
- Frontend shell (`apps/frontend-shell`):
  - Vite + React + TypeScript with pnpm workspace wiring.
  - Reusable API client that talks to the Match Orchestrator (configurable base URL).
  - Lobby dashboard showing rooms, participants, ready states, countdown preview.
  - Form-driven actions (create room, join, ready toggle, start countdown).

### Design Notes
- This slice stays fully in-memory to keep the prototype fast; persistence can be swapped later.
- API schemas mirror the architecture doc’s room/match entities so other services and tests stay aligned.
- Frontend leans on SWR-style hooks for data poll/update to mimic realtime without websockets yet.
- By grounding the first UI in actual service responses, we validate the contracts early and reduce rework when the real orchestrator + SPA land.

### Next Steps After Iteration 1 (Not in scope yet)
- Promote countdown stream to WebSockets via `packages/http-kit`.
- Integrate puzzle metadata from `puzzle-service`.
- Add E2E contract tests that hit both service + frontend (Playwright/Vitest).

