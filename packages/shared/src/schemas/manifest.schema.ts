import { z } from "zod";

export const catalogExtraSchema = z.object({
  name: z.string(),
  isRequired: z.boolean().optional(),
  options: z.array(z.string()).optional(),
});

export const catalogDefinitionSchema = z.object({
  type: z.string(),
  id: z.string(),
  name: z.string(),
  extra: z.array(catalogExtraSchema).optional(),
});

export const resourceDefinitionSchema = z.union([
  z.string(),
  z.object({
    name: z.string(),
    types: z.array(z.string()).optional(),
    idPrefixes: z.array(z.string()).optional(),
  }),
]);

export const addonManifestSchema = z.object({
  id: z.string().min(1),
  version: z.string().regex(/^\d+\.\d+\.\d+/, "Must be semver"),
  name: z.string().min(1),
  description: z.string(),
  logo: z.string().url().optional(),
  resources: z.array(resourceDefinitionSchema).min(1),
  types: z.array(z.string()).min(1),
  catalogs: z.array(catalogDefinitionSchema),
  idPrefixes: z.array(z.string()).optional(),
});

export type AddonManifestInput = z.infer<typeof addonManifestSchema>;
