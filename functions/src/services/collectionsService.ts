import { ConflictError, NotFoundError, ValidationError } from "../errors";
import { MAX_COLLECTIONS_PER_USER } from "../config/constants";
import * as repo from "../repositories/collectionsRepository";
import { CollectionDoc, toNameKey } from "../repositories/collectionsRepository";
import { CollectionDTO, toCollectionDTO } from "../mappers/collectionMapper";
import {
  CreateCollectionInput,
  ListCollectionsQuery,
  UpdateCollectionInput,
} from "../schemas/collection";

export interface CollectionListPage {
  items: CollectionDTO[];
  nextCursor: string | null;
}

// Opaque cursor = base64url([createdAtMillis, id]) of the last returned doc.
function encodeCursor(createdAtMillis: number, id: string): string {
  return Buffer.from(JSON.stringify([createdAtMillis, id])).toString("base64url");
}

function decodeCursor(cursor: string): { createdAtMillis: number; id: string } {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    if (
      Array.isArray(parsed) &&
      parsed.length === 2 &&
      typeof parsed[0] === "number" &&
      typeof parsed[1] === "string"
    ) {
      return { createdAtMillis: parsed[0], id: parsed[1] };
    }
  } catch {
    // fall through to the single error below
  }
  throw new ValidationError("Invalid pagination cursor", undefined, "INVALID_CURSOR");
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

export async function getCollection(uid: string, id: string): Promise<CollectionDTO> {
  const snap = await repo.readCollection(uid, id);
  // Another user's id lives under a different uid path, so it simply "does not
  // exist" here -> 404 (never 403, to avoid leaking existence).
  if (!snap.exists) {
    throw new NotFoundError("Collection not found", "COLLECTION_NOT_FOUND");
  }
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

  // limit+1 was fetched: a surplus doc means there is a next page.
  const hasMore = docs.length > query.limit;
  const pageDocs = hasMore ? docs.slice(0, query.limit) : docs;

  const items = pageDocs.map((doc) => toCollectionDTO(doc.id, doc.data() as CollectionDoc));

  let nextCursor: string | null = null;
  if (hasMore) {
    const last = pageDocs[pageDocs.length - 1];
    const lastData = last.data() as CollectionDoc;
    nextCursor = encodeCursor(lastData.createdAt.toMillis(), last.id);
  }

  return { items, nextCursor };
}
