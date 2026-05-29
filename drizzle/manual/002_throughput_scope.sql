-- Manual migration for throughput_scope table.

CREATE TABLE IF NOT EXISTS "throughput_scope" (
  "id" uuid NOT NULL,
  "revision" integer NOT NULL,
  "project_id" uuid NOT NULL,
  "name" text NOT NULL,
  "filter" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "valid_from" timestamp with time zone DEFAULT now() NOT NULL,
  "valid_to" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "throughput_scope_id_revision_pk" PRIMARY KEY("id", "revision")
);

ALTER TABLE "throughput_scope"
  ADD CONSTRAINT "throughput_scope_project_id_project_id_fk"
  FOREIGN KEY ("project_id") REFERENCES "public"."project"("id")
  ON DELETE cascade ON UPDATE no action;

CREATE INDEX IF NOT EXISTS "throughput_scope_current_idx"
  ON "throughput_scope" USING btree ("id", "revision" DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS "throughput_scope_project_active_idx"
  ON "throughput_scope" USING btree ("project_id", "is_active", "valid_to");
