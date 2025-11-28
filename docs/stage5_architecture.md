## Stage 5 System Architecture Overview

The platform is organized as a multi-tier system with stateless API services, a dedicated chemistry/validation cluster, and a TypeScript SPA client (future mobile shell can reuse the same APIs). Traffic flows through an API gateway that performs rate limiting and auth delegation before routing to domain services. The most compute-heavy logic—chemistry validation and scoring—lives in an autoscaled “Referee” microservice that exposes synchronous gRPC endpoints for low-latency match play and async workers for contest backlogs. Persistent data is split between PostgreSQL for relational entities, object storage for molecule or pathway blobs, and Redis for cache/pub-sub. A WebSocket hub inside the Match Orchestrator delivers real-time match events to clients. CI/CD deploys Dockerized services onto Kubernetes (or managed ECS), allowing each service to scale independently.

### Component Summary
- **API Gateway / Edge**: TLS termination, auth enforcement, routing, basic DDoS/rate protection.
- **Auth & Identity Service**: OAuth providers, session tokens, profile creation, permission flags.
- **Player Profile & Rating Service**: Stores per-ladder ratings, progress stats, personalization settings.
- **Puzzle & Contest Manager**: CRUD for puzzles, starting pools, contest schedules, baseline routes.
- **Match Orchestrator**: Manages lobbies/rooms, countdowns, WebSocket channels, timer authority.
- **Submission & Scoring Service**: Persists submissions, triggers validation, records latency metrics.
- **Referee / Chemistry Engine**: Validation templates, scoring logic, synchronous verify endpoint, async workers.
- **Leaderboard & Stats Service**: Aggregates scores, publishes ladders, exposes historical performance.
- **Notification Service**: Email/push for contest reminders, match invites.
- **PostgreSQL Cluster**: Primary relational store with read replicas for analytics.
- **Redis**: Cache for hot puzzle data, pub/sub bus for lobby events, WebSocket presence.
- **Object Storage**: Stores SVG assets, pathway graphs, replay bundles.
- **Frontend SPA (web)**: React/Vite app served via CDN; mobile clients can wrap via React Native WebView.

### Core Entities
| Entity | Key Fields / Notes |
| --- | --- |
| **User** | `id`, `handle`, `email`, `auth_provider`, `roles`, `preferences`, `created_at`. |
| **Rating** | `user_id`, `ladder_type`, `rating_value`, `rating_deviation`, `last_match_at`. |
| **Puzzle** | `id`, `tier`, `difficulty`, `target_molecule_id`, `allowed_start_set_id`, `rulebook_version`, `metadata` (JSONB). |
| **Contest** | `id`, `name`, `start_time`, `end_time`, `puzzle_ids[]`, `scoring_rules` (JSONB), `visibility`. |
| **Room/Match** | `id`, `mode`, `puzzle_id`, `participants[]`, `status`, `start_time`, `timer_config`, `websocket_channel`. |
| **Submission** | `id`, `match_id`, `user_id`, `pathway_id`, `submit_time`, `validity`, `score`, `latency_ms`, `referee_version`. |
| **Pathway** | `id`, `topology_graph` (JSONB), `metrics` (steps, penalties, convergence), `client_version`. |
| **Molecule** | `id`, `canonical_smiles`, `display_svg_url`, `functional_group_tags`, `tier_flags`. |
| **Reaction** | `id`, `template_id`, `reagent_variant`, `context_flags`, `harshness_tag`, `allowed_tiers`. |
| **StartingMaterial** | `id`, `molecule_id`, `tier`, `cost_tag`, `availability`. |
| **LeaderboardEntry** | `ladder_id`, `user_id`, `score`, `rank`, `snapshot_ts`, `season_id`. |

### Real-Time Communication
- **Technology**: WebSockets (with HTTP fallback via SSE for restricted environments) managed by the Match Orchestrator; Redis pub/sub or NATS fans out updates to WebSocket edge nodes.
- **Events**:
  - `room.join` / `room.leave`: broadcast participant roster updates and connection quality.
  - `room.ready_state`: toggle when players mark themselves ready in the lobby.
  - `match.countdown`: authoritative timer ticks leading to synchronized start.
  - `match.start`: payload containing puzzle metadata, target rendering, timer config.
  - `match.progress`: optional heartbeat (step count, submission flag) without leaking route details.
  - `match.time_remaining`: periodic corrections to keep clients synced with server clock.
  - `match.submission_result`: per-player validity + score summary as soon as referee responds.
  - `match.results`: final ranking table, scores, penalties, route highlights.
  - `match.rematch_offer`: lightweight state machine for instant rematch requests.

### Persistence & Scalability Notes
- **Database**: PostgreSQL with partitioned tables for submissions and pathway blobs stored as JSONB + compressed attachments in object storage. Read replicas serve leaderboards/analytics to avoid impacting OLTP workloads.
- **Caching**: Redis caches puzzle metadata, starting pools, and room state; TTL-based invalidation aligned with contest lifecycle. Chemistry templates are cached in the Referee service with version hashes.
- **High Submission Volume**: During contests, submissions are accepted into a durable queue (e.g., Kafka/SQS). Real-time matches use synchronous gRPC to Referee; contests use async workers with priority lanes for near-time-limit entries. Rate limiting protects the Referee from bursts.
- **Fault Tolerance**: Each service runs multiple pods across availability zones; queues buffer submissions if Referee nodes restart. Database writes leverage logical replication; nightly snapshots cover disaster recovery. WebSocket hubs use sticky sessions with fallback reconnection policies.

### Prototype Status & Next Steps
- The match orchestrator lobby slice is now prototyped end-to-end (service + frontend shell) using the contracts defined here. See `docs/prototype_service_frontend_plan.md` for scope, payloads, and UX details.
- Shared contracts include `MatchRoom`, `RoomParticipant`, and `CountdownState`, allowing downstream services and clients to build against stable interfaces before persistence layers exist.
- The frontend shell provides a reference integration path (TanStack Router/Query, Zustand, React Compiler-ready components) and can be extended as other services expose richer APIs.

### Assumptions & Open Questions
1. Should the chemistry templates be versioned per puzzle to guarantee deterministic replays, or can we rely on global rulebook snapshots referenced by hash?
2. What SLA is required for real-time match validation (e.g., 200 ms p95), and can the same Referee deployment satisfy contest throughput without separate clusters?
3. Are mobile push notifications (APNs/FCM) needed at launch, implying a dedicated notification pipeline beyond email?
4. Do we need GDPR/FERPA compliance features (data export/delete), affecting how user and pathway data are partitioned?
5. How are large pathway graphs rendered in the client—do we stream pre-rendered SVGs or let the client rebuild from JSON, affecting bandwidth?
6. What is the target peak concurrency during contests, and does it require multi-region WebSocket edges to keep latency acceptable globally?
7. Should match history and replay blobs live in cold storage after a retention period to control database size, and how quickly must they be retrievable?
