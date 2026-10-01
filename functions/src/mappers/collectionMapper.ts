import { CollectionDoc } from "../repositories/collectionsRepository";

// Public shape of a collection. Note: nameKey is intentionally NOT exposed —
// it is an internal uniqueness key, not part of the API contract.
export interface CollectionDTO {
  id: string;
  userId: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
}

// Firestore doc -> DTO; Timestamp -> ISO 8601 string.
export function toCollectionDTO(id: string, doc: CollectionDoc): CollectionDTO {
  return {
    id,
    userId: doc.userId,
    name: doc.name,
    description: doc.description,
    createdAt: doc.createdAt.toDate().toISOString(),
    updatedAt: doc.updatedAt.toDate().toISOString(),
  };
}
