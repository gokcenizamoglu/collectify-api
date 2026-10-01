import { Router } from "express";
import * as controller from "../controllers/itemsController";

// mergeParams exposes :collectionId from the parent collections router. Auth is
// inherited because this router is mounted inside the authenticated collections
// router, so no authenticate call is needed here.
export const itemsRouter = Router({ mergeParams: true });

itemsRouter.post("/", controller.createItem);
itemsRouter.get("/", controller.listItems);
itemsRouter.get("/:itemId", controller.getItem);
itemsRouter.put("/:itemId", controller.updateItem);
itemsRouter.delete("/:itemId", controller.deleteItem);
