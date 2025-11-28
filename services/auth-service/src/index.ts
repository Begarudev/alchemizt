import { RouteDefinition, ServiceName } from "@alchemizt/contracts";
import { createServiceApp } from "@alchemizt/http-kit";

const routes: RouteDefinition[] = [
  {
    method: "POST",
    path: "/sessions/oauth",
    description: "Exchange an OAuth code for a session",
    handledBy: ServiceName.Auth,
  },
  {
    method: "GET",
    path: "/sessions/:sessionId",
    description: "Lookup an existing session",
    handledBy: ServiceName.Auth,
  },
  {
    method: "DELETE",
    path: "/sessions/:sessionId",
    description: "Invalidate a session token",
    handledBy: ServiceName.Auth,
  },
];

const service = createServiceApp({
  serviceName: ServiceName.Auth,
  summary: "Identity provider bridge and token issuance",
  defaultPort: 4001,
  routes,
  register: (router) => {
    router.post("/sessions/oauth", (req, res) => {
      const { provider, code } = req.body;
      res.json({
        sessionId: `sess_${Date.now()}`,
        provider,
        code,
        createdAt: new Date().toISOString(),
      });
    });

    router.get("/sessions/:sessionId", (req, res) => {
      res.json({
        sessionId: req.params.sessionId,
        status: "active",
        issuedAt: new Date(Date.now() - 60_000).toISOString(),
      });
    });

    router.delete("/sessions/:sessionId", (req, res) => {
      res.json({
        sessionId: req.params.sessionId,
        revoked: true,
        revokedAt: new Date().toISOString(),
      });
    });
  },
});

service.start();
