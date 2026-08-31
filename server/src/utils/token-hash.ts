import { createHmac, randomBytes } from "node:crypto";
import { env } from "../config/env.js";

/**
 * Hash opaque credentials before persistence. HMAC keeps database compromise
 * from turning a token table into a bearer-token dump while remaining
 * deterministic for indexed lookups.
 */
export function hashOpaqueToken(value: string, key = env.tokenHashKey) {
  return createHmac("sha256", key).update(value, "utf8").digest("hex");
}

export function createOpaqueToken() {
  return randomBytes(32).toString("base64url");
}
