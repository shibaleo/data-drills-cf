-- Manual migration for review_scope table.
-- Apply via Supabase SQL editor (or psql) after the schema change.

CREATE TABLE IF NOT EXISTS "review_scope" (
  "id" uuid NOT NULL,
  "revision" integer NOT NULL,
  "project_id" uuid NOT NULL,
  "name" text NOT NULL,
  "filter" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "valid_from" timestamp with time zone DEFAULT now() NOT NULL,
  "valid_to" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "review_scope_id_revision_pk" PRIMARY KEY("id", "revision")
);

ALTER TABLE "review_scope"
  DROP CONSTRAINT IF EXISTS "review_scope_project_id_project_id_fk";
ALTER TABLE "review_scope"
  ADD CONSTRAINT "review_scope_project_id_project_id_fk"
  FOREIGN KEY ("project_id") REFERENCES "public"."project"("id")
  ON DELETE cascade ON UPDATE no action;

CREATE INDEX IF NOT EXISTS "review_scope_current_idx"
  ON "review_scope" USING btree ("id", "revision" DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS "review_scope_project_active_idx"
  ON "review_scope" USING btree ("project_id", "is_active", "valid_to");

-- Backfill: 1 default scope per existing project.
INSERT INTO "review_scope" (id, revision, project_id, name, filter, is_active)
SELECT gen_random_uuid(), 1, p.id, 'Default', '{}'::jsonb, true
FROM "project" p
WHERE NOT EXISTS (
  SELECT 1 FROM "review_scope" rs WHERE rs.project_id = p.id
);
