import type { AuthPayload } from "./modules/auth/auth.middleware.js";

// Extend Hono's ContextVariableMap so that c.get("user") / c.set("user")
// are properly typed across every route handler — no more `as any` casts.
declare module "hono" {
  interface ContextVariableMap {
    user: AuthPayload;
    deviceId: string;
    requestId?: string;
  }
}
