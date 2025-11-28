# Stage 5 API Scaffold

The initial scaffold mirrors the services described in `stage5_architecture.md`. It supplies:

- pnpm workspace wiring (`package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`).
- Shared type contracts (`packages/contracts`).
- Shared HTTP helpers (`packages/http-kit`) that wrap Express with JSON parsing, request logging, `/health`, `/routes`, and typed bootstrap helpers.
- One Express entrypoint per service under `services/*` with strict TypeScript builds and domain-flavoured placeholder routes.

## Local Development

```bash
pnpm install
pnpm dev
```

Running `pnpm dev` spawns `tsx` watchers for every service plus `tsc -w` for shared packages, so imports always resolve to fresh builds. Individual services can be built or started with:

```bash
pnpm --filter @alchemizt/<service-name> build
pnpm --filter @alchemizt/<service-name> start
```

## Health Checks & Contracts

Every service currently provides:

- `GET /health` — returns a typed `HealthReport` that upstream load balancers can probe.
- `GET /` — describes the service responsibility pulled from the architecture doc so teams can confirm wiring quickly.
- `GET /routes` — advertises every domain route (method, path, handler) exported by that process.

Shared enums (`ServiceName`) and interfaces (`MatchEvent`, `RouteDefinition`, `SubmissionEnvelope`) live in `packages/contracts`. Services should import these rather than redefining domain shapes. `packages/http-kit` centralizes middleware such as request logging, async error handling, and standardized health responses.

Example verification flow:

```bash
pnpm --filter @alchemizt/api-gateway build
pnpm --filter @alchemizt/api-gateway start &
curl -s http://localhost:4000/edge/routes | jq
```

## Next Steps

- Fill in service-specific routers/controllers per the architecture responsibilities.
- Add shared middleware (logging, tracing, auth) that can be reused by multiple services.
- Introduce integration tests that compose the HTTP surfaces and gRPC stubs described in the Stage 5 plan.
