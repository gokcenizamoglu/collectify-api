import {
  DocumentSnapshot,
  FieldPath,
  FieldValue,
  Query,
  QueryDocumentSnapshot,
  Timestamp,
  Transaction,
} from "firebase-admin/firestore";
import { db } from "../config/firebase";
import { collectionRef } from "./collectionsRepository";

export type Priority = "low" | "medium" | "high";

// Persisted item document (read shape: timestamps resolved). url/imageUrl are
// null when unset so "no url" has one representation.
export interface ItemDoc {
  collectionId: string;
  userId: string;
  title: string;
  content: string;
  url: string | null;
  imageUrl: string | null;
  tags: string[];
  priority: Priority;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// Items live under their collection: the parent path comes from the collections
// repository, so the collection path stays defined in one place.
const itemsCol = (uid: string, cid: string) => collectionRef(uid, cid).collection("items");
const itemRef = (uid: string, cid: string, iid: string) => itemsCol(uid, cid).doc(iid);

export function newItemId(uid: string, cid: string): string {
  return itemsCol(uid, cid).doc().id;
}

export function runInTransaction<T>(fn: (tx: Transaction) => Promise<T>): Promise<T> {
  return db.runTransaction(fn);
}

// ---- Reads ----
export function getItemTx(
  tx: Transaction,
  uid: string,
  cid: string,
  iid: string,
): Promise<DocumentSnapshot> {
  return tx.get(itemRef(uid, cid, iid));
}

export function readItem(uid: string, cid: string, iid: string): Promise<DocumentSnapshot> {
  return itemRef(uid, cid, iid).get();
}

// ---- Writes ----
export interface NewItemFields {
  title: string;
  content: string;
  url: string | null;
  imageUrl: string | null;
  tags: string[];
  priority: Priority;
}

export function createItem(
  tx: Transaction,
  uid: string,
  cid: string,
  id: string,
  fields: NewItemFields,
): void {
  tx.set(itemRef(uid, cid, id), {
    collectionId: cid,
    userId: uid,
    title: fields.title,
    content: fields.content,
    url: fields.url,
    imageUrl: fields.imageUrl,
    tags: fields.tags,
    priority: fields.priority,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
}

export interface ItemUpdateFields {
  title?: string;
  content?: string;
  url?: string | null;
  imageUrl?: string | null;
  tags?: string[];
  priority?: Priority;
}

export function updateItemFields(
  tx: Transaction,
  uid: string,
  cid: string,
  iid: string,
  fields: ItemUpdateFields,
): void {
  tx.update(itemRef(uid, cid, iid), { ...fields, updatedAt: FieldValue.serverTimestamp() });
}

export function deleteItem(tx: Transaction, uid: string, cid: string, iid: string): void {
  tx.delete(itemRef(uid, cid, iid));
}

// One page ordered by createdAt desc (documentId desc tie-break), with optional
// equality/array-contains filters, fetching limit+1 to detect a next page.
export interface ListItemsOptions {
  limit: number;
  startAfter?: { createdAtMillis: number; id: string };
  priority?: Priority;
  tag?: string;
}

export async function listItemsPage(
  uid: string,
  cid: string,
  options: ListItemsOptions,
): Promise<QueryDocumentSnapshot[]> {
  let query: Query = itemsCol(uid, cid);
  if (options.priority) {
    query = query.where("priority", "==", options.priority);
  }
  if (options.tag) {
    query = query.where("tags", "array-contains", options.tag);
  }
  query = query.orderBy("createdAt", "desc").orderBy(FieldPath.documentId(), "desc");
  if (options.startAfter) {
    query = query.startAfter(Timestamp.fromMillis(options.startAfter.createdAtMillis), options.startAfter.id);
  }

  const snapshot = await query.limit(options.limit + 1).get();
  return snapshot.docs;
}
