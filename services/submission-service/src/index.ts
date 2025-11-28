import { RouteDefinition, ServiceName, SubmissionEnvelope } from "@alchemizt/contracts";
import { createServiceApp } from "@alchemizt/http-kit";

const routes: RouteDefinition[] = [
  {
    method: "POST",
    path: "/submissions",
    description: "Persist a submission and forward to the referee",
    handledBy: ServiceName.Submission,
  },
  {
    method: "GET",
    path: "/submissions/:submissionId",
    description: "Fetch submission status",
    handledBy: ServiceName.Submission,
  },
];

const submissions = new Map<string, SubmissionEnvelope & { status: string }>();

const service = createServiceApp({
  serviceName: ServiceName.Submission,
  summary: "Submission intake, persistence, and referee handoff",
  defaultPort: 4005,
  routes,
  register: (router) => {
    router.post("/submissions", (req, res) => {
      const submissionId = `sub_${Date.now()}`;
      const envelope: SubmissionEnvelope = {
        submissionId,
        matchId: req.body?.matchId ?? "match_unknown",
        userId: req.body?.userId ?? "user_unknown",
        pathwayId: req.body?.pathwayId ?? "pw_unknown",
        submittedAt: new Date().toISOString(),
        refereeVersion: "v1",
      };
      submissions.set(submissionId, { ...envelope, status: "queued" });
      res.status(202).json({
        ...envelope,
        status: "queued",
      });
    });

    router.get("/submissions/:submissionId", (req, res) => {
      const submission = submissions.get(req.params.submissionId);
      if (!submission) {
        res.status(404).json({ error: "submission_not_found" });
        return;
      }
      res.json(submission);
    });
  },
});

service.start();
