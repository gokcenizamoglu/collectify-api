import rateLimit from "express-rate-limit";
import { RATE_LIMIT_WINDOW_MS, rateLimitMax } from "../config/constants";
import { getAuthUser } from "./authenticate";
import { RateLimitError } from "../errors";

// Per-user rate limit. Must run AFTER authenticate so req.user exists.
//
// Keyed by uid, not IP: mobile clients sit behind carrier NAT/CGNAT and share
// IPs, so an IP limit would punish unrelated users together; a uid is one person.
//
// LIMITATION: the default store is in-memory, so the counter is PER INSTANCE.
// Cloud Functions scales horizontally, so with N instances the effective limit
// is ~N * limit. This only stops a single user from hammering one instance.
// A real global limit needs a shared store (Redis / Firestore) or an upstream
// gateway (API Gateway / Cloud Armor); maxInstances in index.ts caps N.
export const rateLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  limit: () => rateLimitMax(),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => getAuthUser(req).uid,
  // Keep the single error format: set Retry-After (not emitted automatically
  // with legacyHeaders off), then hand an AppError to the error handler instead
  // of writing the 429 body here.
  handler: (_req, res, next) => {
    res.setHeader("Retry-After", String(Math.ceil(RATE_LIMIT_WINDOW_MS / 1000)));
    next(new RateLimitError());
  },
});
