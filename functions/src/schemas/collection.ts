import { z } from "zod";
import { DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT } from "../config/constants";

// strictObject rejects unknown body fields (business rule 7).
// .trim() runs before the length checks, so " " is an empty name.
export const createCollectionSchema = z.strictObject({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500).optional().default(""),
});

// Same fields, all optional, but at least one must be present (PUT trade-off).
export const updateCollectionSchema = z
  .strictObject({
    name: z.string().trim().min(1).max(100).optional(),
    description: z.string().trim().max(500).optional(),
  })
  .refine((body) => body.name !== undefined || body.description !== undefined, {
    message: "At least one of 'name' or 'description' must be provided",
  });

// Query string: limit is coerced from its string form; cursor is opaque here
// (its contents are validated in the service, which can throw INVALID_CURSOR).
export const listCollectionsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_LIMIT).default(DEFAULT_PAGE_LIMIT),
  cursor: z.string().optional(),
});

export type CreateCollectionInput = z.infer<typeof createCollectionSchema>;
export type UpdateCollectionInput = z.infer<typeof updateCollectionSchema>;
export type ListCollectionsQuery = z.infer<typeof listCollectionsQuerySchema>;
