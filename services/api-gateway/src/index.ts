import { RouteDefinition, ServiceName } from "@alchemizt/contracts";
import { createServiceApp } from "@alchemizt/http-kit";

const upstreamTargets = [
  { service: ServiceName.Auth, url: "http://localhost:4001" },
  { service: ServiceName.PlayerProfile, url: "http://localhost:4002" },
  { service: ServiceName.Puzzle, url: "http://localhost:4003" },
  { service: ServiceName.MatchOrchestrator, url: "http://localhost:4004" },
  { service: ServiceName.Submission, url: "http://localhost:4005" },
  { service: ServiceName.Referee, url: "http://localhost:4006" },
  { service: ServiceName.Leaderboard, url: "http://localhost:4007" },
  { service: ServiceName.Notification, url: "http://localhost:4008" },
];

const routes: RouteDefinition[] = [
  {
    method: "GET",
    path: "/edge/routes",
    description: "List upstream service targets advertised by the gateway",
    handledBy: ServiceName.ApiGateway,
  },
  {
    method: "GET",
    path: "/edge/upstream/:service/health",
    description: "Fetch cached health info for a downstream service",
    handledBy: ServiceName.ApiGateway,
  },
  {
    method: "GET",
    path: "/edge/rate-limit",
    description: "Expose the current client rate-limit bucket",
    handledBy: ServiceName.ApiGateway,
  },
];

const service = createServiceApp({
  serviceName: ServiceName.ApiGateway,
  summary: "Edge routing, auth delegation, rate limiting entrypoint",
  defaultPort: 4000,
  routes,
  register: (router) => {
    router.get("/edge/routes", (_req, res) => {
      res.json({ upstreams: upstreamTargets });
    });

    router.get("/edge/upstream/:service/health", (req, res) => {
      const requestedService = req.params.service as ServiceName;
      const upstream = upstreamTargets.find((entry) => entry.service === requestedService);
      res.json({
        service: requestedService,
        reachable: Boolean(upstream),
        lastCheckedAt: new Date().toISOString(),
      });
    });

    router.get("/edge/rate-limit", (_req, res) => {
      res.json({ bucket: "global", remaining: 5000, resetInMs: 60_000 });
    });
  },
});

service.start();
