import { RouteDefinition, ServiceName } from "@alchemizt/contracts";
import { createServiceApp } from "@alchemizt/http-kit";

const routes: RouteDefinition[] = [
  {
    method: "GET",
    path: "/puzzles",
    description: "List puzzles filtered by tier",
    handledBy: ServiceName.Puzzle,
  },
  {
    method: "POST",
    path: "/contests",
    description: "Create a contest with puzzle pool",
    handledBy: ServiceName.Puzzle,
  },
  {
    method: "GET",
    path: "/contests/:contestId",
    description: "Fetch contest metadata",
    handledBy: ServiceName.Puzzle,
  },
];

const service = createServiceApp({
  serviceName: ServiceName.Puzzle,
  summary: "Puzzle definitions, pools, and contest scheduling logic",
  defaultPort: 4003,
  routes,
  register: (router) => {
    router.get("/puzzles", (req, res) => {
      const tier = req.query.tier ?? "all";
      res.json({
        tier,
        puzzles: [
          { id: "pz_001", difficulty: "medium" },
          { id: "pz_002", difficulty: "hard" },
        ],
      });
    });

    router.post("/contests", (req, res) => {
      res.status(201).json({
        contestId: `contest_${Date.now()}`,
        payload: req.body,
        status: "scheduled",
      });
    });

    router.get("/contests/:contestId", (req, res) => {
      res.json({
        contestId: req.params.contestId,
        startTime: new Date(Date.now() + 3_600_000).toISOString(),
        puzzleCount: 5,
      });
    });
  },
});

service.start();
