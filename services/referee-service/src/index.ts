import { RouteDefinition, ServiceName } from "@alchemizt/contracts";
import { createServiceApp } from "@alchemizt/http-kit";

const routes: RouteDefinition[] = [
  {
    method: "POST",
    path: "/validate",
    description: "Validate a pathway and return a score",
    handledBy: ServiceName.Referee,
  },
  {
    method: "GET",
    path: "/templates/:templateId",
    description: "Describe a chemistry template",
    handledBy: ServiceName.Referee,
  },
];

const service = createServiceApp({
  serviceName: ServiceName.Referee,
  summary: "Chemistry validation templates and scoring",
  defaultPort: 4006,
  routes,
  register: (router) => {
    router.post("/validate", (req, res) => {
      const baseScore = Math.round(Math.random() * 1000);
      res.json({
        matchId: req.body?.matchId ?? "match_unknown",
        valid: true,
        score: baseScore,
        penalties: [],
        latencyMs: 42,
      });
    });

    router.get("/templates/:templateId", (req, res) => {
      res.json({
        templateId: req.params.templateId,
        rulebookVersion: "2025.1",
        cachedAt: new Date().toISOString(),
      });
    });
  },
});

service.start();
