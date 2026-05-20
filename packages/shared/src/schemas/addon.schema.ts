import { z } from "zod";

export const addonInstallSchema = z.object({
  transportUrl: z.string().url("Must be a valid URL"),
});
