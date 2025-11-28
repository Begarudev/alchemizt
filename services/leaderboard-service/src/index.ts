import { RouteDefinition, ServiceName } from "@alchemizt/contracts";
import { createServiceApp } from "@alchemizt/http-kit";

const routes: RouteDefinition[] = [
  {
    method: "GET",
    path: "/leaderboards/:ladderId",
    description: "Return the current ladder standings",
    handledBy: ServiceName.Leaderboard,
  },
  {
    method: "GET",
    path: "/leaderboards/:ladderId/history",
    description: "Return snapshot history for a ladder",
    handledBy: ServiceName.Leaderboard,
  },
];

const service = createServiceApp({
  serviceName: ServiceName.Leaderboard,
  summary: "Aggregations, rankings, and stats publication",
  defaultPort: 4007,
  routes,
  register: (router) => {
    router.get("/leaderboards/:ladderId", (req, res) => {
      res.json({
        ladderId: req.params.ladderId,
        season: "s-12",
        entries: [
          { rank: 1, userId: "u_alpha", score: 9820 },
          { rank: 2, userId: "u_beta", score: 9675 },
        ],
      });
    });

    router.get("/leaderboards/:ladderId/history", (req, res) => {
      res.json({
        ladderId: req.params.ladderId,
        snapshots: [
          { ts: Date.now() - 86_400_000, topScore: 9500 },
          { ts: Date.now(), topScore: 9820 },
        ],
      });
    });
  },
});

service.start();
