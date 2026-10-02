import { randomUUID } from "node:crypto";
import { RequestHandler } from "express";
import * as logger from "firebase-functions/logger";

// A client-supplied request id must be short and safe to echo/log.
const REQUEST_ID_PATTERN = /^[A-Za-z0-9-_]{1,128}$/;

// First middleware. Assigns a request id (reusing a valid inbound X-Request-Id),
// echoes it back, and logs exactly one structured access line when the response
// finishes. Never logs tokens, bodies, or headers.
export const requestContext: RequestHandler = (req, res, next) => {
  const inbound = req.header("X-Request-Id");
  const requestId = inbound && REQUEST_ID_PATTERN.test(inbound) ? inbound : randomUUID();

  req.requestId = requestId;
  res.setHeader("X-Request-Id", requestId);

  const startedAt = Date.now();

  res.on("finish", () => {
    // The matched route sets res.locals.routeTemplate (tagRoute). It is undefined
    // when no route matched or a middleware (auth/rate limit) ended the request
    // before the route handler ran -> "unmatched".
    const route = typeof res.locals.routeTemplate === "string" ? res.locals.routeTemplate : "unmatched";
    logger.info("request", {
      requestId,
      method: req.method,
      route,
      status: res.statusCode,
      durationMs: Date.now() - startedAt,
      uid: req.user?.uid,
    });
  });

  next();
};
