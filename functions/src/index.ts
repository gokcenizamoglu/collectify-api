import { onRequest } from "firebase-functions/v2/https";
import { app } from "./app";
import { REGION } from "./config/constants";

// Single HTTPS function hosting the whole Express app, pinned to one region.
export const api = onRequest({ region: REGION }, app);
