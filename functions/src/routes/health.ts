import { Router } from "express";
import { SERVICE_ID } from "../config/constants";

export const healthRouter = Router();

// Liveness probe. No auth. Returns the exact payload the case specifies —
// deliberately NOT wrapped in the standard { data } envelope.
healthRouter.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok", serviceId: SERVICE_ID });
});
