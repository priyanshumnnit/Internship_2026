ALTER TABLE "Order"
ADD COLUMN "serviceAddress" TEXT;

UPDATE "Order"
SET "serviceAddress" = CONCAT_WS(', ', "block", "district", "state")
WHERE "serviceAddress" IS NULL;

ALTER TABLE "Order"
ALTER COLUMN "serviceAddress" SET NOT NULL;
