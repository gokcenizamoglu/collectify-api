import { Request, Response } from "express";
import { getAuthUser } from "../middleware/authenticate";
import * as service from "../services/collectionsService";
import {
  createCollectionSchema,
  listCollectionsQuerySchema,
  updateCollectionSchema,
} from "../schemas/collection";

// Controllers only: read validated input + uid, call one service method, map to
// the response envelope. No Firestore here. Express 5 forwards any rejected
// promise to the error handler, so no try/catch is needed.

export async function createCollection(req: Request, res: Response): Promise<void> {
  const { uid } = getAuthUser(req);
  const input = createCollectionSchema.parse(req.body);
  const dto = await service.createCollection(uid, input);
  res.status(201).location(`/collections/${dto.id}`).json({ data: dto });
}

export async function listCollections(req: Request, res: Response): Promise<void> {
  const { uid } = getAuthUser(req);
  // Parsed here (not in middleware): Express 5 req.query is a read-only getter.
  const query = listCollectionsQuerySchema.parse(req.query);
  const page = await service.listCollections(uid, query);
  res.status(200).json({ data: page.items, pagination: { nextCursor: page.nextCursor } });
}

export async function getCollection(
  req: Request<{ collectionId: string }>,
  res: Response,
): Promise<void> {
  const { uid } = getAuthUser(req);
  const data = await service.getCollectionWithItems(uid, req.params.collectionId);
  res.status(200).json({ data });
}

export async function updateCollection(
  req: Request<{ collectionId: string }>,
  res: Response,
): Promise<void> {
  const { uid } = getAuthUser(req);
  const input = updateCollectionSchema.parse(req.body);
  const dto = await service.updateCollection(uid, req.params.collectionId, input);
  res.status(200).json({ data: dto });
}

export async function deleteCollection(
  req: Request<{ collectionId: string }>,
  res: Response,
): Promise<void> {
  const { uid } = getAuthUser(req);
  await service.deleteCollection(uid, req.params.collectionId);
  res.status(204).send();
}
