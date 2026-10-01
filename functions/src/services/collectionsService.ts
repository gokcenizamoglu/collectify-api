import { DocumentData } from "firebase-admin/firestore";
import { ConflictError, NotFoundError } from "../errors";
import { DEFAULT_PAGE_LIMIT, MAX_COLLECTIONS_PER_USER } from "../config/constants";
import * as repo from "../repositories/collectionsRepository";
import { CollectionDoc, toNameKey } from "../repositories/collectionsRepository";
import * as itemsRepo from "../repositories/itemsRepository";
import { ItemDoc } from "../repositories/itemsRepository";
import { CollectionDTO, toCollectionDTO } from "../mappers/collectionMapper";
import { ItemDTO, toItemDTO } from "../mappers/itemMapper";
import { buildPage, decodeCursor, Page } from "./pagination";
import {
  CreateCollectionInput,
  ListCollectionsQuery,
  UpdateCollectionInput,
} from "../schemas/collection";

export type CollectionListPage = Page<CollectionDTO>;

export interface CollectionWithItems extends CollectionDTO {
  items: ItemDTO[];
  itemsNextCursor: string | null;
}

function collectionToDTO(id: string, data: DocumentData): CollectionDTO {
  return toCollectionDTO(id, data as CollectionDoc);
}

function itemToDTO(id: string, data: DocumentData): ItemDTO {
  return toItemDTO(id, data as ItemDoc);
}

export async function createCollection(
  uid: string,
  input: CreateCollectionInput,
): Promise<CollectionDTO> {
  const nameKey = toNameKey(input.name);
  const id = repo.newCollectionId(uid);

  await repo.runInTransaction(async (tx) => {
    // 1. All reads first — Firestore requires every read before any write.
    const [userSnap, lockSnap] = await Promise.all([
      repo.getUser(tx, uid),
      repo.getLock(tx, uid, nameKey),
    ]);

    // 2. If the name lock already exists, the name is taken (case-insensitive).
    if (lockSnap.exists) {
      throw new ConflictError(
        "A collection with this name already exists",
        "DUPLICATE_COLLECTION_NAME",
      );
    }

    // 3. Enforce the per-user limit from the counter read above (never count()).
    const count = (userSnap.data()?.collectionCount as number | undefined) ?? 0;
    if (count >= MAX_COLLECTIONS_PER_USER) {
      throw new ConflictError("Collection limit reached", "COLLECTION_LIMIT_REACHED");
    }

    // 4. Writes: the collection doc, the name lock, and the counter +1 — all in
    // this one transaction so the limit and uniqueness can never be raced.
    repo.createCollection(tx, uid, id, { name: input.name, nameKey, description: input.description });
    repo.setLock(tx, uid, nameKey, id);
    repo.incrementCollectionCount(tx, uid, 1);
  });

  // serverTimestamp() resolves only on commit and cannot be read back inside the
  // transaction, so we read the doc once more to return real ISO timestamps.
  const snap = await repo.readCollection(uid, id);
  return toCollectionDTO(snap.id, snap.data() as CollectionDoc);
}

export async function updateCollection(
  uid: string,
  id: string,
  input: UpdateCollectionInput,
): Promise<CollectionDTO> {
  await repo.runInTransaction(async (tx) => {
    // Read the target collection first (also covers the 404 case).
    const snap = await repo.getCollectionTx(tx, uid, id);
    if (!snap.exists) {
      throw new NotFoundError("Collection not found", "COLLECTION_NOT_FOUND");
    }
    const current = snap.data() as CollectionDoc;

    const fields: { name?: string; nameKey?: string; description?: string } = {};
    if (input.description !== undefined) {
      fields.description = input.description;
    }

    if (input.name !== undefined) {
      const newNameKey = toNameKey(input.name);
      if (newNameKey === current.nameKey) {
        // Only case/whitespace changed: same identity, so leave the lock alone
        // and just update the displayed name.
        fields.name = input.name;
      } else {
        // Real rename: the new lock must be free (read before any write).
        const newLockSnap = await repo.getLock(tx, uid, newNameKey);
        if (newLockSnap.exists) {
          throw new ConflictError(
            "A collection with this name already exists",
            "DUPLICATE_COLLECTION_NAME",
          );
        }
        fields.name = input.name;
        fields.nameKey = newNameKey;
        // Move the lock: drop the old one, claim the new one.
        repo.deleteLock(tx, uid, current.nameKey);
        repo.setLock(tx, uid, newNameKey, id);
      }
    }

    // Write the field changes (updatedAt is set by the repository).
    repo.updateCollectionFields(tx, uid, id, fields);
  });

  const snap = await repo.readCollection(uid, id);
  return toCollectionDTO(snap.id, snap.data() as CollectionDoc);
}

export async function listCollections(
  uid: string,
  query: ListCollectionsQuery,
): Promise<CollectionListPage> {
  const startAfter = query.cursor ? decodeCursor(query.cursor) : undefined;
  const docs = await repo.listCollectionsPage(uid, query.limit, startAfter);
  return buildPage(docs, query.limit, collectionToDTO);
}

// GET /collections/:id returns the collection with its first page of items
// embedded; the rest are fetched via /collections/:id/items?cursor=...
export async function getCollectionWithItems(
  uid: string,
  id: string,
): Promise<CollectionWithItems> {
  const snap = await repo.readCollection(uid, id);
  if (!snap.exists) {
    throw new NotFoundError("Collection not found", "COLLECTION_NOT_FOUND");
  }
  const collection = toCollectionDTO(snap.id, snap.data() as CollectionDoc);

  // Collection already proven to exist, so read items directly (no re-check).
  const docs = await itemsRepo.listItemsPage(uid, id, { limit: DEFAULT_PAGE_LIMIT });
  const itemsPage = buildPage(docs, DEFAULT_PAGE_LIMIT, itemToDTO);

  return { ...collection, items: itemsPage.items, itemsNextCursor: itemsPage.nextCursor };
}
