CREATE TABLE "answer" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"problem_id" uuid NOT NULL,
	"date" timestamp with time zone NOT NULL,
	"duration" integer,
	"answer_status_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "answer_status" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"color" text,
	"point" integer DEFAULT 0 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"stability_days" integer DEFAULT 0 NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_key" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"key_hash" text NOT NULL,
	"key_prefix" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "backlog" (
	"id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"daily_minutes" integer NOT NULL,
	"time_multiplier_pct" integer DEFAULT 100 NOT NULL,
	"weekday_weights" jsonb DEFAULT '[1,1,1,1,1,1,1]'::jsonb NOT NULL,
	"filter" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"valid_from" timestamp with time zone DEFAULT now() NOT NULL,
	"valid_to" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "backlog_id_revision_pk" PRIMARY KEY("id","revision")
);
--> statement-breakpoint
CREATE TABLE "filter_pref" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"filters" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "flashcard" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"project_id" uuid NOT NULL,
	"topic_id" uuid,
	"front" text NOT NULL,
	"back" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "flashcard_problem" (
	"flashcard_id" uuid NOT NULL,
	"problem_id" uuid NOT NULL,
	CONSTRAINT "flashcard_problem_flashcard_id_problem_id_pk" PRIMARY KEY("flashcard_id","problem_id")
);
--> statement-breakpoint
CREATE TABLE "flashcard_review" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"flashcard_id" uuid NOT NULL,
	"quality" integer NOT NULL,
	"reviewed_at" timestamp with time zone NOT NULL,
	"next_review_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "flashcard_tag" (
	"flashcard_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	CONSTRAINT "flashcard_tag_flashcard_id_tag_id_pk" PRIMARY KEY("flashcard_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "goal_layer" (
	"id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"backlog_id" uuid NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"color" text,
	"opacity_pct" integer,
	"line_style" text,
	"line_width" integer,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"valid_from" timestamp with time zone DEFAULT now() NOT NULL,
	"valid_to" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "goal_layer_id_revision_pk" PRIMARY KEY("id","revision")
);
--> statement-breakpoint
CREATE TABLE "goal_milestone" (
	"id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"backlog_id" uuid NOT NULL,
	"layer_id" uuid NOT NULL,
	"target" integer NOT NULL,
	"date" date NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"valid_from" timestamp with time zone DEFAULT now() NOT NULL,
	"valid_to" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "goal_milestone_id_revision_pk" PRIMARY KEY("id","revision")
);
--> statement-breakpoint
CREATE TABLE "level" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"project_id" uuid NOT NULL,
	"color" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oauth_token" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"access_token" text NOT NULL,
	"refresh_token" text,
	"token_expires_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "problem" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"project_id" uuid NOT NULL,
	"subject_id" uuid,
	"level_id" uuid,
	"topic_id" uuid,
	"name" text,
	"checkpoint" text,
	"standard_time" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "problem_file" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"problem_id" uuid NOT NULL,
	"gdrive_file_id" text NOT NULL,
	"file_name" text,
	"problem_pages" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "problem_tag" (
	"problem_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	CONSTRAINT "problem_tag_problem_id_tag_id_pk" PRIMARY KEY("problem_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "project" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"color" text,
	"gdrive_folder_id" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"answer_id" uuid NOT NULL,
	"content" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_scope" (
	"id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"filter" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"valid_from" timestamp with time zone DEFAULT now() NOT NULL,
	"valid_to" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "review_scope_id_revision_pk" PRIMARY KEY("id","revision")
);
--> statement-breakpoint
CREATE TABLE "review_tag" (
	"review_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	CONSTRAINT "review_tag_review_id_tag_id_pk" PRIMARY KEY("review_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "subject" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"project_id" uuid NOT NULL,
	"color" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tag" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"color" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "topic" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"project_id" uuid NOT NULL,
	"color" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"external_id" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_credential" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"password_hash" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "answer" ADD CONSTRAINT "answer_problem_id_problem_id_fk" FOREIGN KEY ("problem_id") REFERENCES "public"."problem"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "answer" ADD CONSTRAINT "answer_answer_status_id_answer_status_id_fk" FOREIGN KEY ("answer_status_id") REFERENCES "public"."answer_status"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "backlog" ADD CONSTRAINT "backlog_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "filter_pref" ADD CONSTRAINT "filter_pref_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flashcard" ADD CONSTRAINT "flashcard_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flashcard" ADD CONSTRAINT "flashcard_topic_id_topic_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topic"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flashcard_problem" ADD CONSTRAINT "flashcard_problem_flashcard_id_flashcard_id_fk" FOREIGN KEY ("flashcard_id") REFERENCES "public"."flashcard"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flashcard_problem" ADD CONSTRAINT "flashcard_problem_problem_id_problem_id_fk" FOREIGN KEY ("problem_id") REFERENCES "public"."problem"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flashcard_review" ADD CONSTRAINT "flashcard_review_flashcard_id_flashcard_id_fk" FOREIGN KEY ("flashcard_id") REFERENCES "public"."flashcard"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flashcard_tag" ADD CONSTRAINT "flashcard_tag_flashcard_id_flashcard_id_fk" FOREIGN KEY ("flashcard_id") REFERENCES "public"."flashcard"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flashcard_tag" ADD CONSTRAINT "flashcard_tag_tag_id_tag_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tag"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "level" ADD CONSTRAINT "level_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "problem" ADD CONSTRAINT "problem_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "problem" ADD CONSTRAINT "problem_subject_id_subject_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subject"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "problem" ADD CONSTRAINT "problem_level_id_level_id_fk" FOREIGN KEY ("level_id") REFERENCES "public"."level"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "problem" ADD CONSTRAINT "problem_topic_id_topic_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topic"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "problem_file" ADD CONSTRAINT "problem_file_problem_id_problem_id_fk" FOREIGN KEY ("problem_id") REFERENCES "public"."problem"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "problem_tag" ADD CONSTRAINT "problem_tag_problem_id_problem_id_fk" FOREIGN KEY ("problem_id") REFERENCES "public"."problem"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "problem_tag" ADD CONSTRAINT "problem_tag_tag_id_tag_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tag"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review" ADD CONSTRAINT "review_answer_id_answer_id_fk" FOREIGN KEY ("answer_id") REFERENCES "public"."answer"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_scope" ADD CONSTRAINT "review_scope_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_tag" ADD CONSTRAINT "review_tag_review_id_review_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."review"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_tag" ADD CONSTRAINT "review_tag_tag_id_tag_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tag"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subject" ADD CONSTRAINT "subject_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topic" ADD CONSTRAINT "topic_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_credential" ADD CONSTRAINT "user_credential_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "answer_status_user_code_key" ON "answer_status" USING btree ("user_id","code");--> statement-breakpoint
CREATE INDEX "backlog_current_idx" ON "backlog" USING btree ("id","revision" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "backlog_project_active_idx" ON "backlog" USING btree ("project_id","is_active","valid_to");--> statement-breakpoint
CREATE UNIQUE INDEX "filter_pref_user_project_key" ON "filter_pref" USING btree ("user_id","project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "flashcard_project_code_key" ON "flashcard" USING btree ("project_id","code");--> statement-breakpoint
CREATE INDEX "goal_layer_current_idx" ON "goal_layer" USING btree ("id","revision" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "goal_layer_backlog_idx" ON "goal_layer" USING btree ("backlog_id","is_active","valid_to");--> statement-breakpoint
CREATE INDEX "goal_milestone_current_idx" ON "goal_milestone" USING btree ("id","revision" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "goal_milestone_backlog_idx" ON "goal_milestone" USING btree ("backlog_id","is_active","valid_to");--> statement-breakpoint
CREATE INDEX "goal_milestone_layer_idx" ON "goal_milestone" USING btree ("layer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "level_project_code_key" ON "level" USING btree ("project_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "oauth_token_user_provider_key" ON "oauth_token" USING btree ("user_id","provider");--> statement-breakpoint
CREATE UNIQUE INDEX "problem_project_code_key" ON "problem" USING btree ("project_id","code","subject_id","level_id");--> statement-breakpoint
CREATE UNIQUE INDEX "project_user_code_key" ON "project" USING btree ("user_id","code");--> statement-breakpoint
CREATE INDEX "review_scope_current_idx" ON "review_scope" USING btree ("id","revision" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "review_scope_project_active_idx" ON "review_scope" USING btree ("project_id","is_active","valid_to");--> statement-breakpoint
CREATE UNIQUE INDEX "subject_project_code_key" ON "subject" USING btree ("project_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "tag_user_code_key" ON "tag" USING btree ("user_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "topic_project_code_key" ON "topic" USING btree ("project_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "user_email_key" ON "user" USING btree ("email");