import { NextFunction, Request, Response } from "express";
import { ServiceName } from "@alchemizt/contracts";

export const requestLogger = (serviceName: ServiceName) =>
  (req: Request, _res: Response, next: NextFunction): void => {
    const started = Date.now();
    _res.on("finish", () => {
      const duration = Date.now() - started;
      console.log(
        `[${serviceName}] ${req.method} ${req.originalUrl} -> ${_res.statusCode} (${duration}ms)`
      );
    });
    next();
  };

export type AsyncRouteHandler = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;

export const asyncHandler = (handler: AsyncRouteHandler) =>
  (req: Request, res: Response, next: NextFunction): void => {
    handler(req, res, next).catch(next);
  };

export const errorHandler = (serviceName: ServiceName) =>
  (err: Error, _req: Request, res: Response, _next: NextFunction): void => {
    console.error(`[${serviceName}] Unhandled error`, err);
    res.status(500).json({
      error: "internal_error",
      message: err.message,
    });
  };
