import { DocumentData } from "firebase-admin/firestore";
import { NotFoundError } from "../errors";
import * as collectionsRepo from "../repositories/collectionsRepository";
import * as itemsRepo from "../repositories/itemsRepository";
import { ItemDoc, ItemUpdateFields } from "../repositories/itemsRepository";
import { ItemDTO, toItemDTO } from "../mappers/itemMapper";
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
): Promise<ItemDTO> {
  const id = itemsRepo.newItemId(uid, collectionId);

  await itemsRepo.runInTransaction(async (tx) => {
    // Read the parent collection first: never write an orphan item into a
    // collection that doesn't exist (or was deleted, or belongs to another user).
    const collSnap = await collectionsRepo.getCollectionTx(tx, uid, collectionId);
    if (!collSnap.exists) {
      throw new NotFoundError("Collection not found", "COLLECTION_NOT_FOUND");
    }
    itemsRepo.createItem(tx, uid, collectionId, id, {
      title: input.title,
      content: input.content,
      url: input.url ?? null,
      imageUrl: input.imageUrl ?? null,
      tags: input.tags,
      priority: input.priority,
    });
  });

  // serverTimestamp() resolves only on commit, so read once for real timestamps.
  const snap = await itemsRepo.readItem(uid, collectionId, id);
  return toItemDTO(snap.id, snap.data() as ItemDoc);
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
