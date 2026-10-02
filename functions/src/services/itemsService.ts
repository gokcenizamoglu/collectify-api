import { DocumentData } from "firebase-admin/firestore";
import { NotFoundError, UnprocessableEntityError } from "../errors";
import * as collectionsRepo from "../repositories/collectionsRepository";
import * as itemsRepo from "../repositories/itemsRepository";
import { ItemDoc, ItemUpdateFields } from "../repositories/itemsRepository";
import * as idempotencyRepo from "../repositories/idempotencyRepository";
import { IdempotencyRecord } from "../repositories/idempotencyRepository";
import { IdempotencyContext } from "../middleware/idempotency";
import { ItemDTO, toItemDTO } from "../mappers/itemMapper";
import { CreateResult } from "./collectionsService";
import { buildPage, decodeCursor, Page } from "./pagination";
import { CreateItemInput, ListItemsQuery, UpdateItemInput } from "../schemas/item";

// buildPage hands us (id, data); narrow data to ItemDoc for the mapper.
function itemToDTO(id: string, data: DocumentData): ItemDTO {
  return toItemDTO(id, data as ItemDoc);
}

export async function createItem(
  uid: string,
  collectionId: string,
  input: CreateItemInput,
  idempotency?: IdempotencyContext,
): Promise<CreateResult<ItemDTO>> {
  const newId = itemsRepo.newItemId(uid, collectionId);

  const { resourceId, replayed } = await itemsRepo.runInTransaction(async (tx) => {
    // 0. Idempotency replay check first (before the collection-existence write path).
    if (idempotency) {
      const idemSnap = await idempotencyRepo.getIdempotencyTx(
        tx,
        uid,
        idempotency.scope,
        idempotency.key,
      );
      if (idemSnap.exists) {
        const record = idemSnap.data() as IdempotencyRecord;
        if (record.requestHash !== idempotency.requestHash) {
          throw new UnprocessableEntityError(
            "Idempotency-Key was already used with a different request body",
            "IDEMPOTENCY_KEY_MISMATCH",
          );
        }
        return { resourceId: record.resourceId, replayed: true };
      }
    }

    // 1. Read the parent collection: never write an orphan item into a
    // collection that doesn't exist (or was deleted, or belongs to another user).
    const collSnap = await collectionsRepo.getCollectionTx(tx, uid, collectionId);
    if (!collSnap.exists) {
      throw new NotFoundError("Collection not found", "COLLECTION_NOT_FOUND");
    }

    // 2. Writes: the item and (if present) the idempotency record, atomically.
    itemsRepo.createItem(tx, uid, collectionId, newId, {
      title: input.title,
      content: input.content,
      url: input.url ?? null,
      imageUrl: input.imageUrl ?? null,
      tags: input.tags,
      priority: input.priority,
    });
    if (idempotency) {
      idempotencyRepo.setIdempotency(tx, uid, idempotency.scope, idempotency.key, {
        requestHash: idempotency.requestHash,
        resourceId: newId,
      });
    }
    return { resourceId: newId, replayed: false };
  });

  // serverTimestamp() resolves only on commit, so read once for real timestamps.
  const snap = await itemsRepo.readItem(uid, collectionId, resourceId);
  // On replay the original item may have since been deleted -> 404.
  if (!snap.exists) {
    throw new NotFoundError("Item not found", "ITEM_NOT_FOUND");
  }
  return { dto: toItemDTO(snap.id, snap.data() as ItemDoc), replayed };
}

export async function listItems(
  uid: string,
  collectionId: string,
  query: ListItemsQuery,
): Promise<Page<ItemDTO>> {
  // A missing collection is a 404 (not an empty list), so check it exists first.
  const collSnap = await collectionsRepo.readCollection(uid, collectionId);
  if (!collSnap.exists) {
    throw new NotFoundError("Collection not found", "COLLECTION_NOT_FOUND");
  }

  const startAfter = query.cursor ? decodeCursor(query.cursor) : undefined;
  const docs = await itemsRepo.listItemsPage(uid, collectionId, {
    limit: query.limit,
    startAfter,
    priority: query.priority,
    tag: query.tag,
  });
  return buildPage(docs, query.limit, itemToDTO);
}

export async function getItem(uid: string, collectionId: string, itemId: string): Promise<ItemDTO> {
  const snap = await itemsRepo.readItem(uid, collectionId, itemId);
  // Another user's (or a wrong) path simply doesn't exist here -> 404.
  if (!snap.exists) {
    throw new NotFoundError("Item not found", "ITEM_NOT_FOUND");
  }
  return toItemDTO(snap.id, snap.data() as ItemDoc);
}

export async function updateItem(
  uid: string,
  collectionId: string,
  itemId: string,
  input: UpdateItemInput,
): Promise<ItemDTO> {
  await itemsRepo.runInTransaction(async (tx) => {
    // Read the item from its path first; missing -> 404.
    const snap = await itemsRepo.getItemTx(tx, uid, collectionId, itemId);
    if (!snap.exists) {
      throw new NotFoundError("Item not found", "ITEM_NOT_FOUND");
    }

    // Only touch fields the client actually sent. url/imageUrl === null clears
    // the field (stored as null); absent leaves it unchanged.
    const fields: ItemUpdateFields = {};
    if (input.title !== undefined) fields.title = input.title;
    if (input.content !== undefined) fields.content = input.content;
    if (input.tags !== undefined) fields.tags = input.tags;
    if (input.priority !== undefined) fields.priority = input.priority;
    if (input.url !== undefined) fields.url = input.url;
    if (input.imageUrl !== undefined) fields.imageUrl = input.imageUrl;

    itemsRepo.updateItemFields(tx, uid, collectionId, itemId, fields);
  });

  const snap = await itemsRepo.readItem(uid, collectionId, itemId);
  return toItemDTO(snap.id, snap.data() as ItemDoc);
}

export async function deleteItem(uid: string, collectionId: string, itemId: string): Promise<void> {
  await itemsRepo.runInTransaction(async (tx) => {
    const snap = await itemsRepo.getItemTx(tx, uid, collectionId, itemId);
    if (!snap.exists) {
      throw new NotFoundError("Item not found", "ITEM_NOT_FOUND");
    }
    itemsRepo.deleteItem(tx, uid, collectionId, itemId);
  });
}
