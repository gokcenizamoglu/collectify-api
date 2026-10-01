import { z } from "zod";
import { DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT } from "../config/constants";

const PRIORITIES = ["low", "medium", "high"] as const;

// Accept only absolute http(s) URLs. We parse with the URL class (explicit and
// strict about the scheme) rather than a regex, so "ftp://..." is rejected.
function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

const httpUrlSchema = z.string().trim().max(2048).refine(isHttpUrl, {
  message: "Must be a valid http(s) URL",
});

// Each tag trimmed and 1–30 chars, at most 20 tags, then lowercased and
// de-duplicated so storage and filtering are case-insensitive.
const tagsSchema = z
  .array(z.string().trim().min(1).max(30))
  .max(20)
  .transform((tags) => Array.from(new Set(tags.map((tag) => tag.toLowerCase()))));

export const createItemSchema = z.strictObject({
  title: z.string().trim().min(3).max(100),
  content: z.string().trim().max(10000).optional().default(""),
  url: httpUrlSchema.optional(),
  imageUrl: httpUrlSchema.optional(),
  tags: tagsSchema.optional().default([]),
  priority: z.enum(PRIORITIES).optional().default("medium"),
});

// All fields optional, at least one required. url/imageUrl accept null, which
// means "clear this field" (vs. absent = "leave unchanged").
export const updateItemSchema = z
  .strictObject({
    title: z.string().trim().min(3).max(100).optional(),
    content: z.string().trim().max(10000).optional(),
    url: httpUrlSchema.nullable().optional(),
    imageUrl: httpUrlSchema.nullable().optional(),
    tags: tagsSchema.optional(),
    priority: z.enum(PRIORITIES).optional(),
  })
  .refine((body) => Object.values(body).some((value) => value !== undefined), {
    message: "At least one field must be provided",
  });

export const listItemsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_LIMIT).default(DEFAULT_PAGE_LIMIT),
  cursor: z.string().optional(),
  priority: z.enum(PRIORITIES).optional(),
  // Lowercased to match the stored (lowercased) tags.
  tag: z
    .string()
    .trim()
    .min(1)
    .max(30)
    .transform((tag) => tag.toLowerCase())
    .optional(),
});

export type CreateItemInput = z.infer<typeof createItemSchema>;
export type UpdateItemInput = z.infer<typeof updateItemSchema>;
export type ListItemsQuery = z.infer<typeof listItemsQuerySchema>;
