import { onRequest } from "firebase-functions/v2/https";
import { app } from "./app";
import { MAX_INSTANCES, REGION } from "./config/constants";

// Single HTTPS function hosting the whole Express app, pinned to one region.
// maxInstances caps horizontal scaling: a cost/abuse ceiling, and it bounds how
// far the per-instance in-memory rate limit can be multiplied across instances.
export const api = onRequest({ region: REGION, maxInstances: MAX_INSTANCES }, app);
