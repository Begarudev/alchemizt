import { RouteDefinition, ServiceName } from "@alchemizt/contracts";
import { createServiceApp } from "@alchemizt/http-kit";

const routes: RouteDefinition[] = [
  {
    method: "GET",
    path: "/players/:handle",
    description: "Fetch a public player profile",
    handledBy: ServiceName.PlayerProfile,
  },
  {
    method: "GET",
    path: "/players/:handle/ratings",
    description: "Return ladder ratings for a player",
    handledBy: ServiceName.PlayerProfile,
  },
  {
    method: "PATCH",
    path: "/players/:handle/preferences",
    description: "Update profile preferences",
    handledBy: ServiceName.PlayerProfile,
  },
];

const service = createServiceApp({
  serviceName: ServiceName.PlayerProfile,
  summary: "Player profiles, ratings, and personalization data",
  defaultPort: 4002,
  routes,
  register: (router) => {
    router.get("/players/:handle", (req, res) => {
      res.json({
        handle: req.params.handle,
        tier: "platinum",
        country: "US",
        joinedAt: "2024-01-15T00:00:00.000Z",
      });
    });

    router.get("/players/:handle/ratings", (req, res) => {
      res.json({
        handle: req.params.handle,
        ladders: [
          { ladder: "speedrun", rating: 1820, deviation: 43 },
          { ladder: "endurance", rating: 1705, deviation: 38 },
        ],
      });
    });

    router.patch("/players/:handle/preferences", (req, res) => {
      res.json({
        handle: req.params.handle,
        preferences: req.body ?? {},
        updatedAt: new Date().toISOString(),
      });
    });
  },
});

service.start();
