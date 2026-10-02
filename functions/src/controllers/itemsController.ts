import { Request, Response } from "express";
import { getAuthUser } from "../middleware/authenticate";
import { extractIdempotency } from "../middleware/idempotency";
import * as service from "../services/itemsService";
import { createItemSchema, listItemsQuerySchema, updateItemSchema } from "../schemas/item";

// collectionId comes from the parent router (mergeParams), itemId from this one.
type CollectionParams = { collectionId: string };
type ItemParams = { collectionId: string; itemId: string };

export async function createItem(req: Request<CollectionParams>, res: Response): Promise<void> {
  const { uid } = getAuthUser(req);
  const { collectionId } = req.params;
  const idempotency = extractIdempotency(req, `POST /collections/${collectionId}/items`);
  const input = createItemSchema.parse(req.body);
  const { dto, replayed } = await service.createItem(uid, collectionId, input, idempotency);
  if (replayed) {
    res.setHeader("Idempotent-Replayed", "true");
  }
  res.status(201).location(`/collections/${collectionId}/items/${dto.id}`).json({ data: dto });
}

export async function listItems(req: Request<CollectionParams>, res: Response): Promise<void> {
  const { uid } = getAuthUser(req);
  const query = listItemsQuerySchema.parse(req.query);
  const page = await service.listItems(uid, req.params.collectionId, query);
  res.status(200).json({ data: page.items, pagination: { nextCursor: page.nextCursor } });
}

export async function getItem(req: Request<ItemParams>, res: Response): Promise<void> {
  const { uid } = getAuthUser(req);
  const dto = await service.getItem(uid, req.params.collectionId, req.params.itemId);
  res.status(200).json({ data: dto });
}

export async function updateItem(req: Request<ItemParams>, res: Response): Promise<void> {
  const { uid } = getAuthUser(req);
  const input = updateItemSchema.parse(req.body);
  const dto = await service.updateItem(uid, req.params.collectionId, req.params.itemId, input);
  res.status(200).json({ data: dto });
}

export async function deleteItem(req: Request<ItemParams>, res: Response): Promise<void> {
  const { uid } = getAuthUser(req);
  await service.deleteItem(uid, req.params.collectionId, req.params.itemId);
  res.status(204).send();
}
