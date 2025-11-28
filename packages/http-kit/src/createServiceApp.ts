import express, { Express, Request, Response, Router } from "express";
import cors from "cors";
import { HealthReport, RouteDefinition, ServiceName } from "@alchemizt/contracts";
import { asyncHandler, errorHandler, requestLogger } from "./middlewares.js";

export interface ServiceAppOptions {
  readonly serviceName: ServiceName;
  readonly summary: string;
  readonly defaultPort: number;
  readonly routes: RouteDefinition[];
  readonly register: (router: Router) => void;
  readonly enableCors?: boolean;
}

export interface RunningServiceApp {
  readonly app: Express;
  readonly port: number;
  start: () => void;
}

export const createServiceApp = (options: ServiceAppOptions): RunningServiceApp => {
  const port = Number(process.env.PORT ?? options.defaultPort);
  const app = express();

  app.use(express.json());
  if (options.enableCors) {
    app.use(cors());
  }
  app.use(requestLogger(options.serviceName));

  app.get("/health", asyncHandler(async (_req: Request, res: Response) => {
    const report: HealthReport = {
      service: options.serviceName,
      status: "ok",
      region: process.env.REGION ?? "local",
      timestamp: new Date().toISOString(),
      details: { routeCount: options.routes.length },
    };
    res.json(report);
  }));

  app.get("/", (_req: Request, res: Response) => {
    res.json({
      message: `Alchemizt ${options.serviceName} ready`,
      summary: options.summary,
    });
  });

  app.get("/routes", (_req: Request, res: Response) => {
    res.json(options.routes);
  });

  const router = express.Router();
  options.register(router);
  app.use(router);

  app.use(errorHandler(options.serviceName));

  return {
    app,
    port,
    start: () => {
      app.listen(port, () => {
        console.log(`[${options.serviceName}] listening on port ${port}`);
      });
    },
  };
};
