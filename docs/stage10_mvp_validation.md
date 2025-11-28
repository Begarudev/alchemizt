## Stage 10 MVP Validation Checklist

### 1. Backend catalog & room APIs
- `pnpm --filter @alchemizt/match-orchestrator dev` (or `start`) to boot the service on `4004`.
- `pnpm --filter @alchemizt/match-orchestrator test` & `pnpm --filter @alchemizt/match-orchestrator lint` must pass (ensures the catalog schema + TypeScript types stay aligned).
- `curl http://localhost:4004/puzzles | jq '.puzzles | length'` should report `20+` entries and each entry contains `metadata` and `timerPreset`.
- `curl http://localhost:4004/puzzles/pz-carbonyl-01 | jq '.metadata.title'` should respond with **Acetophenone Sprint**.
- `curl -s http://localhost:4004/rooms | jq '.rooms'` should be empty before creation. `curl -s -X POST http://localhost:4004/rooms -H 'Content-Type: application/json' -d '{"hostHandle":"qa-host","puzzleId":"pz-carbonyl-02","mode":"speedrun"}'` should succeed and reuse the timer preset defined in the catalog.

### 2. Frontend shell experience
- `pnpm --filter frontend-shell dev` connects to `http://localhost:5173` and loads the Stage 10 lobby hero.
- The “Create a room” form lists all puzzles from `/puzzles`; selecting a puzzle refreshes the metadata card (difficulty, estimated time, tags).
- Mode dropdown surfaces only the modes allowed by the selected puck (speedrun or endurance). Attempting to select an unsupported mode should auto-reset to the first available entry.
- Creating a room immediately surfaces the new room card with puzzle metadata chips and the canonical timer. Joining/readying/countdown flows should update the card without page refreshes.

### 3. Analytics & telemetry spot checks
- When creating rooms, readying, or starting countdowns, watch the terminal running `match-orchestrator`; it should print `[analytics:room.created]`, `[analytics:room.ready_toggled]`, and `[analytics:room.countdown_started]` entries with room + puzzle identifiers.
- Submitting a mock competitive result (via `curl -X POST http://localhost:4004/competitive/matches/<roomId>/result ...`) should emit `[analytics:match.result_recorded]` and update the ladder snapshot returned by `/competitive/dashboard`.
- Verify that `/rooms` now includes `puzzleMetadata` so downstream clients have a single source of truth for target molecules and timer presets.

### 4. Regression & manual sign-off
- Smoke-test matchmaking enqueue/cancel and confirm the dashboard still refreshes queue telemetry alongside the new puzzle card.
- Record screenshots (or short Loom) of: catalog dropdown, puzzle summary panel, updated room card, and competitive dashboard. Attach to the release issue for historical reference.
- File any discrepancies (missing puzzle metadata, incorrect timer) before promoting to the public beta milestone.

