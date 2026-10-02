-- AlterTable: add as nullable, backfill existing users with a random
-- 64-hex-char key (two gen_random_uuid() values, dashes stripped), then
-- enforce NOT NULL.
ALTER TABLE "User" ADD COLUMN "encryptionKey" TEXT;

UPDATE "User"
SET "encryptionKey" = replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')
WHERE "encryptionKey" IS NULL;

ALTER TABLE "User" ALTER COLUMN "encryptionKey" SET NOT NULL;
