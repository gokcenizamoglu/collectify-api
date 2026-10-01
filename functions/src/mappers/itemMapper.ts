import { ItemDoc, Priority } from "../repositories/itemsRepository";

export interface ItemDTO {
  id: string;
  collectionId: string;
  userId: string;
  title: string;
  content: string;
  url: string | null;
  imageUrl: string | null;
  tags: string[];
  priority: Priority;
  createdAt: string;
  updatedAt: string;
}

// Firestore doc -> DTO; Timestamp -> ISO 8601. url/imageUrl surface as null when
// absent (older docs may not have the field at all).
export function toItemDTO(id: string, doc: ItemDoc): ItemDTO {
  return {
    id,
    collectionId: doc.collectionId,
    userId: doc.userId,
    title: doc.title,
    content: doc.content,
    url: doc.url ?? null,
    imageUrl: doc.imageUrl ?? null,
    tags: doc.tags,
    priority: doc.priority,
    createdAt: doc.createdAt.toDate().toISOString(),
    updatedAt: doc.updatedAt.toDate().toISOString(),
  };
}
