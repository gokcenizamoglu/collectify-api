import { DocumentData, QueryDocumentSnapshot, Timestamp } from "firebase-admin/firestore";
import { ValidationError } from "../errors";

// Shared cursor pagination used by both collections and items.
// A cursor is the opaque base64url of [createdAtMillis, id] of the last row.

export interface CursorParts {
  createdAtMillis: number;
  id: string;
}

export function encodeCursor(createdAtMillis: number, id: string): string {
  return Buffer.from(JSON.stringify([createdAtMillis, id])).toString("base64url");
}

export function decodeCursor(cursor: string): CursorParts {
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

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

// Turn the limit+1 fetched docs into a page: slice to the page size, map each
// doc to a DTO, and derive nextCursor from the last kept doc when there's more.
// Every paginated doc has a createdAt Timestamp (collections and items alike).
export function buildPage<T>(
  docs: QueryDocumentSnapshot[],
  limit: number,
  toDTO: (id: string, data: DocumentData) => T,
): Page<T> {
  const hasMore = docs.length > limit;
  const pageDocs = hasMore ? docs.slice(0, limit) : docs;
  const items = pageDocs.map((doc) => toDTO(doc.id, doc.data()));

  let nextCursor: string | null = null;
  if (hasMore) {
    const last = pageDocs[pageDocs.length - 1];
    const createdAt = last.get("createdAt") as Timestamp;
    nextCursor = encodeCursor(createdAt.toMillis(), last.id);
  }

  return { items, nextCursor };
}
