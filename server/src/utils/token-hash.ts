import { createHmac, randomBytes } from "node:crypto";
import { env } from "../config/env.js";

/**
 * Hash opaque credentials before persistence. HMAC keeps database compromise
 * from turning a token table into a bearer-token dump while remaining
 * deterministic for indexed lookups. Callers only pass high-entropy tokens;
 * user passwords continue to use bcrypt in the auth service.
 */
export function hashOpaqueToken(value: string, key = env.tokenHashKey) {
  // codeql[js/insufficient-password-hash] This is a keyed digest for 256-bit random tokens, not a user-password hash; passwords use bcrypt above.
  return createHmac("sha256", key).update(value, "utf8").digest("hex");
}

export function createOpaqueToken() {
  return randomBytes(32).toString("base64url");
}
