import { RequestHandler } from "express";
import { NotFoundError } from "../errors";

// Catch-all for unmatched routes. Forwarding an error to next() hands control
// to the error handler, so unknown routes get the same standard error shape.
export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new NotFoundError(`Route not found: ${req.method} ${req.originalUrl}`, "ROUTE_NOT_FOUND"));
};
