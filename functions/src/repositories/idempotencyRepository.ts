import { createHash } from "node:crypto";
import { DocumentSnapshot, FieldValue, Timestamp, Transaction } from "firebase-admin/firestore";
import { db } from "../config/firebase";
import { IDEMPOTENCY_TTL_MS } from "../config/constants";

// Stored idempotency record. expiresAt drives the Firestore TTL policy.
export interface IdempotencyRecord {
  requestHash: string;
  resourceId: string;
  createdAt: Timestamp;
  expiresAt: Timestamp;
}

// Doc id = sha256(scope + key); hashed because scope/key are arbitrary strings
// that may exceed doc-id limits or contain "/". Same idea as the name lock.
function docId(scope: string, key: string): string {
  return createHash("sha256").update(`${scope}:${key}`).digest("hex");
}

const idempotencyRef = (uid: string, scope: string, key: string) =>
  db.collection("users").doc(uid).collection("idempotencyKeys").doc(docId(scope, key));

export function getIdempotencyTx(
  tx: Transaction,
  uid: string,
  scope: string,
  key: string,
): Promise<DocumentSnapshot> {
  return tx.get(idempotencyRef(uid, scope, key));
}

export function setIdempotency(
  tx: Transaction,
  uid: string,
  scope: string,
  key: string,
  record: { requestHash: string; resourceId: string },
): void {
  tx.set(idempotencyRef(uid, scope, key), {
    requestHash: record.requestHash,
    resourceId: record.resourceId,
    createdAt: FieldValue.serverTimestamp(),
    expiresAt: Timestamp.fromMillis(Date.now() + IDEMPOTENCY_TTL_MS),
  });
}
