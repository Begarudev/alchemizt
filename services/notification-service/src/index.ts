import { RouteDefinition, ServiceName } from "@alchemizt/contracts";
import { createServiceApp } from "@alchemizt/http-kit";

const routes: RouteDefinition[] = [
  {
    method: "POST",
    path: "/notifications/email",
    description: "Queue an email notification",
    handledBy: ServiceName.Notification,
  },
  {
    method: "POST",
    path: "/notifications/push",
    description: "Queue a push notification",
    handledBy: ServiceName.Notification,
  },
  {
    method: "GET",
    path: "/notifications/outbox",
    description: "Inspect pending notifications",
    handledBy: ServiceName.Notification,
  },
];

const outbox: Array<{ id: string; channel: string; payload: unknown }> = [];

const service = createServiceApp({
  serviceName: ServiceName.Notification,
  summary: "Outbound emails, pushes, and reminders",
  defaultPort: 4008,
  routes,
  register: (router) => {
    router.post("/notifications/email", (req, res) => {
      const id = `email_${Date.now()}`;
      outbox.push({ id, channel: "email", payload: req.body });
      res.status(202).json({ id, channel: "email" });
    });

    router.post("/notifications/push", (req, res) => {
      const id = `push_${Date.now()}`;
      outbox.push({ id, channel: "push", payload: req.body });
      res.status(202).json({ id, channel: "push" });
    });

    router.get("/notifications/outbox", (_req, res) => {
      res.json({ pending: outbox });
    });
  },
});

service.start();
