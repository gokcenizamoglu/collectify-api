import { Router } from "express";
import { tagRoute } from "../middleware/routeTag";
import * as controller from "../controllers/itemsController";

// mergeParams exposes :collectionId from the parent collections router. Auth is
// inherited because this router is mounted inside the authenticated collections
// router, so no authenticate call is needed here.
export const itemsRouter = Router({ mergeParams: true });

// Full template prefix (the mount path keeps :collectionId as a param, not the
// real id) so the access log stays low-cardinality.
const BASE = "/collections/:collectionId/items";

itemsRouter.post("/", tagRoute(BASE), controller.createItem);
itemsRouter.get("/", tagRoute(BASE), controller.listItems);
itemsRouter.get("/:itemId", tagRoute(BASE), controller.getItem);
itemsRouter.put("/:itemId", tagRoute(BASE), controller.updateItem);
itemsRouter.delete("/:itemId", tagRoute(BASE), controller.deleteItem);
