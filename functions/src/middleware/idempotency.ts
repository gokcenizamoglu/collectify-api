import { createHash } from "node:crypto";
import { Request } from "express";
import { ValidationError } from "../errors";

const KEY_PATTERN = /^[A-Za-z0-9-_]{8,128}$/;

// What the service needs to enforce idempotency: the scope (method + concrete
// route, so a key is unique per endpoint+resource), the client key, and a hash
// of the request body (to detect the same key reused with a different body).
export interface IdempotencyContext {
  scope: string;
  key: string;
  requestHash: string;
}

// Read the optional Idempotency-Key header. Absent -> undefined (no idempotency).
// Present but malformed -> 400 INVALID_IDEMPOTENCY_KEY. The body hash is computed
// from the raw parsed body (before zod defaults), so it reflects what was sent.
export function extractIdempotency(req: Request, scope: string): IdempotencyContext | undefined {
  const key = req.header("Idempotency-Key");
  if (key === undefined) {
    return undefined;
  }
  if (!KEY_PATTERN.test(key)) {
    throw new ValidationError(
      "Idempotency-Key must be 8-128 chars of [A-Za-z0-9-_]",
      undefined,
      "INVALID_IDEMPOTENCY_KEY",
    );
  }
  const requestHash = createHash("sha256")
    .update(JSON.stringify(req.body ?? {}))
    .digest("hex");
  return { scope, key, requestHash };
}
