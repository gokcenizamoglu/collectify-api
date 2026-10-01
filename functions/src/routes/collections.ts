import { Router } from "express";
import { authenticate } from "../middleware/authenticate";
import * as controller from "../controllers/collectionsController";

// Mounted at /collections in app.ts, so paths here are relative. Auth applies to
// the whole router (and only to it — /health, on its own router, stays public,
// and unknown routes fall through to the 404 handler without hitting auth).
export const collectionsRouter = Router();

collectionsRouter.use(authenticate);

collectionsRouter.post("/", controller.createCollection);
collectionsRouter.get("/", controller.listCollections);
collectionsRouter.get("/:collectionId", controller.getCollection);
collectionsRouter.put("/:collectionId", controller.updateCollection);
