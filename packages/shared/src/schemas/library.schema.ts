import { z } from "zod";

/** Zod schema for a library item (watchlist entry) */
export const libraryItemSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  type: z.enum(["movie", "series"]),
  itemId: z.string().min(1),
  title: z.string().min(1),
  poster: z.string().url().optional().nullable(),
  addedAt: z.string().datetime(),
});

/** Request to add an item to the library */
export const addToLibrarySchema = z.object({
  type: z.enum(["movie", "series"]),
  itemId: z.string().min(1),
  title: z.string().min(1),
  poster: z.string().url().optional(),
});

/** Request to remove an item from the library */
export const removeFromLibrarySchema = z.object({
  itemId: z.string().min(1),
});

/** Zod schema for watch progress */
export const watchProgressSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  type: z.enum(["movie", "series"]),
  itemId: z.string().min(1),
  season: z.number().int().nonnegative().optional().nullable(),
  episode: z.number().int().nonnegative().optional().nullable(),
  currentTime: z.number().nonnegative(),
  duration: z.number().positive(),
  title: z.string().min(1),
  poster: z.string().url().optional().nullable(),
  lastWatched: z.string().datetime(),
});

/** Request to update watch progress */
export const updateProgressSchema = z.object({
  type: z.enum(["movie", "series"]),
  itemId: z.string().min(1),
  season: z.number().int().nonnegative().optional(),
  episode: z.number().int().nonnegative().optional(),
  currentTime: z.number().nonnegative(),
  duration: z.number().positive(),
  title: z.string().min(1),
  poster: z.string().url().optional(),
});

/** Inferred types */
export type LibraryItemInput = z.infer<typeof addToLibrarySchema>;
export type WatchProgressInput = z.infer<typeof updateProgressSchema>;
