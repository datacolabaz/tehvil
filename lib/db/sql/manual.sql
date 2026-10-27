-- Idempotent changes that the generated (additive) schema cannot express. Appended to schema.sql by build-schema-sql.
-- Never drop tables, columns or data here.

-- Whole-diary photo links (no stage chosen in advance).
ALTER TABLE "stage_photo_invites" ALTER COLUMN "work_id" DROP NOT NULL;
