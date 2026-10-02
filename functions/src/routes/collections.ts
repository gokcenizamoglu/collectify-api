import { Router } from "express";
import { authenticate } from "../middleware/authenticate";
import { rateLimiter } from "../middleware/rateLimit";
import { tagRoute } from "../middleware/routeTag";
import * as controller from "../controllers/collectionsController";
import { itemsRouter } from "./items";

const BASE = "/collections";

// Mounted at /collections in app.ts, so paths here are relative. Auth applies to
// the whole router (and only to it — /health, on its own router, stays public,
// and unknown routes fall through to the 404 handler without hitting auth).
export const collectionsRouter = Router();

// Auth first (sets req.user), then the per-user rate limit (keyed by uid).
collectionsRouter.use(authenticate);
collectionsRouter.use(rateLimiter);

collectionsRouter.post("/", tagRoute(BASE), controller.createCollection);
collectionsRouter.get("/", tagRoute(BASE), controller.listCollections);
collectionsRouter.get("/:collectionId", tagRoute(BASE), controller.getCollection);
collectionsRouter.put("/:collectionId", tagRoute(BASE), controller.updateCollection);
collectionsRouter.delete("/:collectionId", tagRoute(BASE), controller.deleteCollection);

// Nested items: /collections/:collectionId/items...
collectionsRouter.use("/:collectionId/items", itemsRouter);
