import { Router } from "express";
import { authenticate } from "../middleware/authenticate";
import { rateLimiter } from "../middleware/rateLimit";
import * as controller from "../controllers/collectionsController";
import { itemsRouter } from "./items";

// Mounted at /collections in app.ts, so paths here are relative. Auth applies to
// the whole router (and only to it — /health, on its own router, stays public,
// and unknown routes fall through to the 404 handler without hitting auth).
export const collectionsRouter = Router();

// Auth first (sets req.user), then the per-user rate limit (keyed by uid).
collectionsRouter.use(authenticate);
collectionsRouter.use(rateLimiter);

collectionsRouter.post("/", controller.createCollection);
collectionsRouter.get("/", controller.listCollections);
collectionsRouter.get("/:collectionId", controller.getCollection);
collectionsRouter.put("/:collectionId", controller.updateCollection);
collectionsRouter.delete("/:collectionId", controller.deleteCollection);

// Nested items: /collections/:collectionId/items...
collectionsRouter.use("/:collectionId/items", itemsRouter);
