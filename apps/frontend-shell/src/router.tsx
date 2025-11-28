import { createRoute, createRootRouteWithContext, createRouter } from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";
import LobbyPage from "./routes/LobbyPage";
import { RootLayout } from "./routes/RootLayout";

interface RouterContext {
  queryClient: QueryClient;
}

const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
});

const lobbyRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: LobbyPage,
});

const routeTree = rootRoute.addChildren([lobbyRoute]);

export const createAppRouter = (queryClient: QueryClient) =>
  createRouter({
    routeTree,
    context: { queryClient },
    defaultPreload: "intent",
  });

export type AppRouter = ReturnType<typeof createAppRouter>;

declare module "@tanstack/react-router" {
  interface Register {
    router: AppRouter;
  }
}
