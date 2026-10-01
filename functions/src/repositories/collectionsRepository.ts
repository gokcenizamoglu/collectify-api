import { createHash } from "node:crypto";
import {
  DocumentSnapshot,
  FieldPath,
  FieldValue,
  QueryDocumentSnapshot,
  Timestamp,
  Transaction,
} from "firebase-admin/firestore";
import { db } from "../config/firebase";

// The persisted collection document (read shape: timestamps are resolved).
export interface CollectionDoc {
  userId: string;
  name: string;
  nameKey: string;
  description: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// Canonical form of a name for uniqueness: NFKC-normalized, trimmed, inner
// whitespace collapsed, lowercased. Single source of truth for both the
// uniqueness check and the lock document id.
export function toNameKey(name: string): string {
  return name.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
}

// The lock doc id is the sha256 of the nameKey because a raw name may contain
// "/" or exceed Firestore's doc-id length limit.
function lockDocId(nameKey: string): string {
  return createHash("sha256").update(nameKey).digest("hex");
}

// ---- Path builders: the ONLY place that knows Firestore layout. ----
const userRef = (uid: string) => db.collection("users").doc(uid);
const collectionsCol = (uid: string) => userRef(uid).collection("collections");
// Exported so the items repository can build the nested items path from it,
// keeping the collection path defined in exactly one place.
export const collectionRef = (uid: string, id: string) => collectionsCol(uid).doc(id);
const lockRef = (uid: string, nameKey: string) =>
  userRef(uid).collection("collectionNames").doc(lockDocId(nameKey));

// Pre-generate a collection id (no write) so the service can build the Location
// header and reference the doc inside the transaction.
export function newCollectionId(uid: string): string {
  return collectionsCol(uid).doc().id;
}

export function runInTransaction<T>(fn: (tx: Transaction) => Promise<T>): Promise<T> {
  return db.runTransaction(fn);
}

// ---- Transactional reads ----
export function getUser(tx: Transaction, uid: string): Promise<DocumentSnapshot> {
  return tx.get(userRef(uid));
}
export function getCollectionTx(tx: Transaction, uid: string, id: string): Promise<DocumentSnapshot> {
  return tx.get(collectionRef(uid, id));
}
export function getLock(tx: Transaction, uid: string, nameKey: string): Promise<DocumentSnapshot> {
  return tx.get(lockRef(uid, nameKey));
}

// ---- Transactional writes ----
export function createCollection(
  tx: Transaction,
  uid: string,
  id: string,
  fields: { name: string; nameKey: string; description: string },
): void {
  tx.set(collectionRef(uid, id), {
    userId: uid,
    name: fields.name,
    nameKey: fields.nameKey,
    description: fields.description,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
}

export function updateCollectionFields(
  tx: Transaction,
  uid: string,
  id: string,
  fields: { name?: string; nameKey?: string; description?: string },
): void {
  tx.update(collectionRef(uid, id), { ...fields, updatedAt: FieldValue.serverTimestamp() });
}

export function setLock(tx: Transaction, uid: string, nameKey: string, collectionId: string): void {
  tx.set(lockRef(uid, nameKey), { collectionId });
}

export function deleteLock(tx: Transaction, uid: string, nameKey: string): void {
  tx.delete(lockRef(uid, nameKey));
}

// Create-or-increment the per-user counter in the same write set.
export function incrementCollectionCount(tx: Transaction, uid: string, by: number): void {
  tx.set(userRef(uid), { collectionCount: FieldValue.increment(by) }, { merge: true });
}

// ---- Non-transactional reads ----
export function readCollection(uid: string, id: string): Promise<DocumentSnapshot> {
  return collectionRef(uid, id).get();
}

// One page ordered by createdAt desc, with documentId desc as a stable tie-break
// for docs sharing a millisecond. Fetches limit+1 to detect a following page.
// startAfter uses raw values (no extra read of the cursor document).
export async function listCollectionsPage(
  uid: string,
  limit: number,
  startAfter?: { createdAtMillis: number; id: string },
): Promise<QueryDocumentSnapshot[]> {
  let query = collectionsCol(uid)
    .orderBy("createdAt", "desc")
    .orderBy(FieldPath.documentId(), "desc");

  if (startAfter) {
    query = query.startAfter(Timestamp.fromMillis(startAfter.createdAtMillis), startAfter.id);
  }

  const snapshot = await query.limit(limit + 1).get();
  return snapshot.docs;
}
