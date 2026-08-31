-- Opaque auth token storage: existing bearer/reset/verification tokens are
-- intentionally invalidated because their plaintext values cannot be safely
-- transformed into keyed digests inside a schema migration.
DELETE FROM "refresh_tokens";
DELETE FROM "password_reset_tokens";
DELETE FROM "email_verification_tokens";

ALTER TABLE "refresh_tokens"
  ADD COLUMN "session_id" TEXT;

ALTER TABLE "refresh_tokens"
  ALTER COLUMN "session_id" SET NOT NULL;

CREATE INDEX "refresh_tokens_user_id_session_id_idx"
  ON "refresh_tokens"("user_id", "session_id");

-- Existing Trakt credentials were stored in plaintext columns. Deleting these
-- rows is the only safe migration without access to the application key;
-- users can reconnect through OAuth after deployment.
DELETE FROM "trakt_tokens";
ALTER TABLE "trakt_tokens"
  DROP COLUMN "access_token",
  DROP COLUMN "refresh_token",
  ADD COLUMN "access_token_ciphertext" TEXT NOT NULL,
  ADD COLUMN "refresh_token_ciphertext" TEXT NOT NULL,
  ADD COLUMN "key_version" INTEGER NOT NULL DEFAULT 1;

CREATE TABLE "real_debrid_tokens" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "access_token_ciphertext" TEXT NOT NULL,
  "refresh_token_ciphertext" TEXT NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "key_version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "real_debrid_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "real_debrid_tokens_user_id_key"
  ON "real_debrid_tokens"("user_id");

ALTER TABLE "real_debrid_tokens"
  ADD CONSTRAINT "real_debrid_tokens_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
