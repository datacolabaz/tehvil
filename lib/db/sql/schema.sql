-- Idempotent schema for Təhvil (generated from lib/db/src/schema with drizzle-kit generate).
-- Safe to run repeatedly: creates missing tables, columns, indexes and foreign keys; never drops anything.
-- Apply with: DATABASE_URL=... pnpm --filter @workspace/db run apply-schema
-- Regenerate after schema changes with: pnpm --filter @workspace/db run build-schema-sql
CREATE TABLE IF NOT EXISTS "change_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"room_id" uuid,
	"number" integer NOT NULL,
	"title" varchar(160) NOT NULL,
	"reason" varchar(1000) NOT NULL,
	"description" text,
	"labor_amount" numeric(14, 2) NOT NULL,
	"material_amount" numeric(14, 2) NOT NULL,
	"schedule_impact_days" integer DEFAULT 0 NOT NULL,
	"new_completion_date" date,
	"status" varchar(32) DEFAULT 'submitted' NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_by" text,
	"decided_at" timestamp with time zone,
	"decision_comment" text
);
--> statement
CREATE TABLE IF NOT EXISTS "evidence_uploads" (
	"object_path" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"original_name" varchar(255) NOT NULL,
	"content_type" varchar(120) NOT NULL,
	"size" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"attached_at" timestamp with time zone
);
--> statement
CREATE TABLE IF NOT EXISTS "renovation_milestones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"title" varchar(120) NOT NULL,
	"description" text,
	"planned_completion_date" date,
	"status" varchar(32) DEFAULT 'planned' NOT NULL,
	"note" text,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement
CREATE TABLE IF NOT EXISTS "passport_shares" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"include_financial" boolean DEFAULT false NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "passport_shares_token_hash_unique" UNIQUE("token_hash")
);
--> statement
CREATE TABLE IF NOT EXISTS "project_media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"entity_type" varchar(24) NOT NULL,
	"entity_id" uuid NOT NULL,
	"object_path" text NOT NULL,
	"original_name" varchar(255) NOT NULL,
	"content_type" varchar(120) NOT NULL,
	"size" integer NOT NULL,
	"uploaded_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement
CREATE TABLE IF NOT EXISTS "project_participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"user_id" text,
	"invited_name" varchar(120) NOT NULL,
	"contact" varchar(254) NOT NULL,
	"role" varchar(24) NOT NULL,
	"invite_token_hash" text,
	"invite_expires_at" timestamp with time zone,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement
CREATE TABLE IF NOT EXISTS "project_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"title" varchar(160) NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"currency" varchar(3) DEFAULT 'AZN' NOT NULL,
	"due_condition" varchar(250),
	"due_date" date,
	"status" varchar(32) DEFAULT 'planned' NOT NULL,
	"note" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement
CREATE TABLE IF NOT EXISTS "renovation_projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" text NOT NULL,
	"name" varchar(120) NOT NULL,
	"property_type" varchar(40) NOT NULL,
	"city" varchar(100) NOT NULL,
	"project_type" varchar(40) NOT NULL,
	"planned_start_date" date,
	"planned_completion_date" date,
	"budget" numeric(14, 2),
	"status" varchar(32) DEFAULT 'planning' NOT NULL,
	"scope_version" integer DEFAULT 1 NOT NULL,
	"scope_status" varchar(32) DEFAULT 'draft' NOT NULL,
	"owner_scope_approved_at" timestamp with time zone,
	"contractor_scope_approved_at" timestamp with time zone,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement
CREATE TABLE IF NOT EXISTS "renovation_rooms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" varchar(80) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement
CREATE TABLE IF NOT EXISTS "revision_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"milestone_id" uuid NOT NULL,
	"title" varchar(160) NOT NULL,
	"issue_description" varchar(1500) NOT NULL,
	"priority" varchar(16) DEFAULT 'normal' NOT NULL,
	"status" varchar(32) DEFAULT 'open' NOT NULL,
	"response" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement
CREATE TABLE IF NOT EXISTS "scope_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"room_id" uuid,
	"scope_version" integer DEFAULT 1 NOT NULL,
	"title" varchar(160) NOT NULL,
	"description" text,
	"inclusion_type" varchar(20) NOT NULL,
	"material_responsibility" varchar(24) NOT NULL,
	"labor_amount" numeric(14, 2),
	"material_estimate" numeric(14, 2),
	"warranty_months" integer,
	"status" varchar(24) DEFAULT 'draft' NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement
CREATE TABLE IF NOT EXISTS "renovation_timeline_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"actor_user_id" text NOT NULL,
	"actor_role" varchar(24) NOT NULL,
	"action" varchar(100) NOT NULL,
	"detail" text NOT NULL,
	"entity_type" varchar(40),
	"entity_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement
CREATE TABLE IF NOT EXISTS "smeta_change_orders" (
	"project_id" uuid NOT NULL,
	"id" varchar(64) NOT NULL,
	"number" integer NOT NULL,
	"title" varchar(160) NOT NULL,
	"reason" varchar(1000) NOT NULL,
	"date" date NOT NULL,
	"requested_by" varchar(16) NOT NULL,
	"requested_by_name" varchar(120) NOT NULL,
	"category" varchar(24) NOT NULL,
	"material_delta" numeric(14, 2) NOT NULL,
	"labor_delta" numeric(14, 2) NOT NULL,
	"additional_cost" numeric(14, 2) NOT NULL,
	"status" varchar(16) NOT NULL,
	"photo_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"line_item_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"decided_at" timestamp with time zone,
	"decided_by" varchar(16),
	"decision_note" varchar(1000),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "smeta_change_orders_project_id_id_pk" PRIMARY KEY("project_id","id")
);
--> statement
CREATE TABLE IF NOT EXISTS "smeta_client_approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"name" varchar(120) NOT NULL,
	"phone" varchar(32) NOT NULL,
	"consent" boolean NOT NULL,
	"total" numeric(14, 2) NOT NULL,
	"ip_address" varchar(64),
	"user_agent" varchar(300),
	"approved_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement
CREATE TABLE IF NOT EXISTS "smeta_estimate_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	"public_snapshot" jsonb NOT NULL,
	"total" numeric(14, 2) NOT NULL,
	"sent_by" text NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement
CREATE TABLE IF NOT EXISTS "smeta_expenses" (
	"project_id" uuid NOT NULL,
	"id" varchar(64) NOT NULL,
	"position" integer NOT NULL,
	"date" date NOT NULL,
	"kind" varchar(16) NOT NULL,
	"category" varchar(24) NOT NULL,
	"description" varchar(300) NOT NULL,
	"vendor" varchar(160) NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"payment_status" varchar(16) NOT NULL,
	"receipt_id" varchar(64),
	"line_item_id" varchar(64),
	CONSTRAINT "smeta_expenses_project_id_id_pk" PRIMARY KEY("project_id","id")
);
--> statement
CREATE TABLE IF NOT EXISTS "smeta_line_items" (
	"project_id" uuid NOT NULL,
	"id" varchar(64) NOT NULL,
	"section_id" varchar(64) NOT NULL,
	"position" integer NOT NULL,
	"name" varchar(200) NOT NULL,
	"zone" varchar(120) NOT NULL,
	"unit" varchar(16) NOT NULL,
	"quantity" numeric(14, 3) NOT NULL,
	"material_unit_price" numeric(14, 4) NOT NULL,
	"labor_unit_price" numeric(14, 4) NOT NULL,
	"additional_cost" numeric(14, 2) NOT NULL,
	"waste_percentage" numeric(7, 4) NOT NULL,
	"margin_percentage" numeric(7, 4),
	"price_source" jsonb NOT NULL,
	"quantity_source" jsonb NOT NULL,
	"status" varchar(16) NOT NULL,
	"material_id" varchar(64),
	"labor_rate_id" varchar(64),
	CONSTRAINT "smeta_line_items_project_id_id_pk" PRIMARY KEY("project_id","id")
);
--> statement
CREATE TABLE IF NOT EXISTS "smeta_measurements" (
	"project_id" uuid NOT NULL,
	"id" varchar(64) NOT NULL,
	"position" integer NOT NULL,
	"kind" varchar(16) NOT NULL,
	"name" varchar(160) NOT NULL,
	"value" numeric(14, 3) NOT NULL,
	"unit" varchar(8) NOT NULL,
	"confidence" numeric(4, 3) NOT NULL,
	"source" varchar(250) NOT NULL,
	"status" varchar(16) NOT NULL,
	"room_id" varchar(64),
	CONSTRAINT "smeta_measurements_project_id_id_pk" PRIMARY KEY("project_id","id")
);
--> statement
CREATE TABLE IF NOT EXISTS "smeta_payment_milestones" (
	"project_id" uuid NOT NULL,
	"id" varchar(64) NOT NULL,
	"position" integer NOT NULL,
	"title" varchar(160) NOT NULL,
	"share" numeric(7, 4) NOT NULL,
	"condition" varchar(250) NOT NULL,
	"status" varchar(16) NOT NULL,
	CONSTRAINT "smeta_payment_milestones_project_id_id_pk" PRIMARY KEY("project_id","id")
);
--> statement
CREATE TABLE IF NOT EXISTS "smeta_photos" (
	"project_id" uuid NOT NULL,
	"id" varchar(64) NOT NULL,
	"position" integer NOT NULL,
	"phase" varchar(8) NOT NULL,
	"date" date NOT NULL,
	"uploaded_by" varchar(120) NOT NULL,
	"note" varchar(500) NOT NULL,
	"room" varchar(120) NOT NULL,
	"category" varchar(24) NOT NULL,
	"line_item_id" varchar(64),
	"client_visible" boolean DEFAULT true NOT NULL,
	"object_path" text,
	CONSTRAINT "smeta_photos_project_id_id_pk" PRIMARY KEY("project_id","id")
);
--> statement
CREATE TABLE IF NOT EXISTS "smeta_project_costs" (
	"project_id" uuid NOT NULL,
	"id" varchar(64) NOT NULL,
	"position" integer NOT NULL,
	"label" varchar(160) NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	CONSTRAINT "smeta_project_costs_project_id_id_pk" PRIMARY KEY("project_id","id")
);
--> statement
CREATE TABLE IF NOT EXISTS "smeta_projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" text NOT NULL,
	"home_id" uuid,
	"name" varchar(120) NOT NULL,
	"district" varchar(100) NOT NULL,
	"address" varchar(250) NOT NULL,
	"property_kind" varchar(16) NOT NULL,
	"renovation_kind" varchar(16) NOT NULL,
	"quality" varchar(16) NOT NULL,
	"area_m2" numeric(10, 2) NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"client_name" varchar(120) NOT NULL,
	"client_phone" varchar(32) NOT NULL,
	"client_email" varchar(254),
	"contractor" jsonb NOT NULL,
	"completion" integer DEFAULT 0 NOT NULL,
	"default_margin_percentage" numeric(7, 4) NOT NULL,
	"status" varchar(32) DEFAULT 'draft' NOT NULL,
	"estimate_id" varchar(64) NOT NULL,
	"estimate_version" integer DEFAULT 1 NOT NULL,
	"estimate_created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"valid_until" date NOT NULL,
	"included" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"excluded" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"drawing" jsonb,
	"exports" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement
CREATE TABLE IF NOT EXISTS "smeta_receipts" (
	"project_id" uuid NOT NULL,
	"id" varchar(64) NOT NULL,
	"file_name" varchar(255) NOT NULL,
	"file_type" varchar(8) NOT NULL,
	"uploaded_at" varchar(40) NOT NULL,
	"object_path" text,
	"ai_suggestion" jsonb,
	CONSTRAINT "smeta_receipts_project_id_id_pk" PRIMARY KEY("project_id","id")
);
--> statement
CREATE TABLE IF NOT EXISTS "smeta_revision_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"name" varchar(120) NOT NULL,
	"message" varchar(1500) NOT NULL,
	"ip_address" varchar(64),
	"user_agent" varchar(300),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement
CREATE TABLE IF NOT EXISTS "smeta_estimate_sections" (
	"project_id" uuid NOT NULL,
	"id" varchar(64) NOT NULL,
	"position" integer NOT NULL,
	"category" varchar(24) NOT NULL,
	"title" varchar(120) NOT NULL,
	CONSTRAINT "smeta_estimate_sections_project_id_id_pk" PRIMARY KEY("project_id","id")
);
--> statement
CREATE TABLE IF NOT EXISTS "smeta_shares" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"token" varchar(64) NOT NULL,
	"version" integer NOT NULL,
	"client_name" varchar(120) NOT NULL,
	"phone" varchar(32) NOT NULL,
	"email" varchar(254),
	"message" varchar(2000) NOT NULL,
	"notify_on_approve" boolean DEFAULT true NOT NULL,
	"attach_pdf" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "smeta_shares_project_id_unique" UNIQUE("project_id"),
	CONSTRAINT "smeta_shares_token_unique" UNIQUE("token")
);
--> statement
CREATE TABLE IF NOT EXISTS "passport_works" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"passport_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"title" text NOT NULL,
	"start_date" date,
	"end_date" date,
	"contractor_name" text DEFAULT '' NOT NULL,
	"contractor_phone" varchar(32) DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"materials" text DEFAULT '' NOT NULL,
	"before_photo_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"after_photo_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"contractor_token_hash" varchar(64),
	"contractor_confirmed_at" timestamp with time zone,
	"contractor_confirmed_name" text,
	"contractor_note" text,
	"handover_status" varchar(12) DEFAULT 'pending' NOT NULL,
	"owner_decided_at" timestamp with time zone,
	"owner_decided_name" text,
	"owner_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement
CREATE TABLE IF NOT EXISTS "property_passports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"public_id" varchar(16) NOT NULL,
	"owner_user_id" varchar(128) NOT NULL,
	"listing_id" uuid,
	"title" text NOT NULL,
	"deal_type" varchar(12) DEFAULT 'sale' NOT NULL,
	"property_kind" varchar(20) NOT NULL,
	"district" text NOT NULL,
	"address" text DEFAULT '' NOT NULL,
	"rooms" integer,
	"area_m2" numeric(10, 2),
	"price" numeric(14, 2),
	"currency" varchar(3) DEFAULT 'AZN' NOT NULL,
	"listing_urls" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"photo_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"realtor" jsonb NOT NULL,
	"status" varchar(12) DEFAULT 'draft' NOT NULL,
	"owner_name" text DEFAULT '' NOT NULL,
	"owner_phone" varchar(32) DEFAULT '' NOT NULL,
	"owner_token_hash" varchar(64),
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement
CREATE TABLE IF NOT EXISTS "realtor_agents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" varchar(128) NOT NULL,
	"full_name" text NOT NULL,
	"phone" varchar(32) DEFAULT '' NOT NULL,
	"email" varchar(254) DEFAULT '' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement
CREATE TABLE IF NOT EXISTS "realtor_appointments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" varchar(128) NOT NULL,
	"lead_id" uuid,
	"listing_id" uuid,
	"agent_id" uuid,
	"starts_at" timestamp with time zone NOT NULL,
	"duration_min" integer DEFAULT 30 NOT NULL,
	"status" varchar(16) DEFAULT 'planned' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"reminder_sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement
CREATE TABLE IF NOT EXISTS "realtor_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" varchar(128) NOT NULL,
	"passport_id" uuid,
	"listing_id" uuid,
	"kind" varchar(20) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement
CREATE TABLE IF NOT EXISTS "realtor_leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" varchar(128) NOT NULL,
	"agent_id" uuid,
	"listing_id" uuid,
	"full_name" text NOT NULL,
	"phone" varchar(32) DEFAULT '' NOT NULL,
	"source" varchar(16) NOT NULL,
	"status" varchar(16) DEFAULT 'new' NOT NULL,
	"deal_type" varchar(12),
	"district" text DEFAULT '' NOT NULL,
	"rooms" integer,
	"budget_min" numeric(14, 2),
	"budget_max" numeric(14, 2),
	"timeframe" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"next_action" text DEFAULT '' NOT NULL,
	"next_action_at" timestamp with time zone,
	"reminder_sent_at" timestamp with time zone,
	"last_contact_at" timestamp with time zone,
	"last_inbound_at" timestamp with time zone,
	"follow_up_sent_at" timestamp with time zone,
	"bot_state" jsonb,
	"ready_for_meeting" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement
CREATE TABLE IF NOT EXISTS "realtor_listings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" varchar(128) NOT NULL,
	"agent_id" uuid,
	"title" text NOT NULL,
	"deal_type" varchar(12) NOT NULL,
	"property_kind" varchar(20) NOT NULL,
	"district" text NOT NULL,
	"address" text DEFAULT '' NOT NULL,
	"rooms" integer,
	"area_m2" numeric(10, 2),
	"floor" varchar(20) DEFAULT '' NOT NULL,
	"price" numeric(14, 2),
	"currency" varchar(3) DEFAULT 'AZN' NOT NULL,
	"status" varchar(12) DEFAULT 'active' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"external_links" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"photo_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement
CREATE TABLE IF NOT EXISTS "realtor_media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" varchar(128) NOT NULL,
	"object_path" text NOT NULL,
	"original_name" text NOT NULL,
	"content_type" varchar(120) NOT NULL,
	"size" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement
CREATE TABLE IF NOT EXISTS "realtor_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" varchar(128) NOT NULL,
	"lead_id" uuid,
	"direction" varchar(4) NOT NULL,
	"kind" varchar(20) NOT NULL,
	"body" text NOT NULL,
	"status" varchar(12) NOT NULL,
	"wa_message_id" varchar(128),
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement
CREATE TABLE IF NOT EXISTS "realtor_notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" varchar(128) NOT NULL,
	"kind" varchar(24) NOT NULL,
	"title" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"href" text DEFAULT '' NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement
CREATE TABLE IF NOT EXISTS "realtor_profiles" (
	"user_id" varchar(128) PRIMARY KEY NOT NULL,
	"full_name" text NOT NULL,
	"agency" text DEFAULT '' NOT NULL,
	"phone" varchar(32) DEFAULT '' NOT NULL,
	"whatsapp" varchar(32) DEFAULT '' NOT NULL,
	"instagram" varchar(120) DEFAULT '' NOT NULL,
	"bio" text DEFAULT '' NOT NULL,
	"photo_media_id" uuid,
	"logo_media_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement
CREATE TABLE IF NOT EXISTS "realtor_whatsapp_settings" (
	"user_id" varchar(128) PRIMARY KEY NOT NULL,
	"mode" varchar(12) DEFAULT 'manual' NOT NULL,
	"business_phone" varchar(32) DEFAULT '' NOT NULL,
	"phone_number_id" varchar(64),
	"access_token_enc" text,
	"auto_reply_enabled" boolean DEFAULT true NOT NULL,
	"greeting" text DEFAULT '' NOT NULL,
	"follow_up_enabled" boolean DEFAULT true NOT NULL,
	"follow_up_hours" integer DEFAULT 48 NOT NULL,
	"follow_up_text" text DEFAULT '' NOT NULL,
	"reminder_enabled" boolean DEFAULT true NOT NULL,
	"reminder_hours_before" integer DEFAULT 3 NOT NULL,
	"reminder_text" text DEFAULT '' NOT NULL,
	"workday_start_hour" integer DEFAULT 10 NOT NULL,
	"workday_end_hour" integer DEFAULT 19 NOT NULL,
	"follow_up_template" varchar(120) DEFAULT '' NOT NULL,
	"reminder_template" varchar(120) DEFAULT '' NOT NULL,
	"template_language" varchar(12) DEFAULT 'az' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement
CREATE TABLE IF NOT EXISTS "equipment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"home_id" uuid NOT NULL,
	"room_id" uuid,
	"install_work_id" uuid,
	"name" varchar(160) NOT NULL,
	"category" varchar(20) DEFAULT 'other' NOT NULL,
	"brand" varchar(80) DEFAULT '' NOT NULL,
	"model" varchar(120) DEFAULT '' NOT NULL,
	"serial_number" varchar(120) DEFAULT '' NOT NULL,
	"installed_at" date,
	"warranty_until" date,
	"photo_media_id" uuid,
	"notes" text DEFAULT '' NOT NULL,
	"next_service_at" date,
	"service_contact" text DEFAULT '' NOT NULL,
	"created_by_user_id" varchar(128) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement
CREATE TABLE IF NOT EXISTS "home_audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"home_id" uuid,
	"worker_id" uuid,
	"actor_user_id" varchar(128) NOT NULL,
	"actor_role" varchar(16) NOT NULL,
	"action" varchar(40) NOT NULL,
	"entity_type" varchar(24) NOT NULL,
	"entity_id" uuid,
	"summary" varchar(300) DEFAULT '' NOT NULL,
	"changes" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement
CREATE TABLE IF NOT EXISTS "home_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" varchar(8) NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"home_id" uuid,
	"work_id" uuid,
	"group_id" uuid,
	"placeholder_worker_id" uuid,
	"role" varchar(16) NOT NULL,
	"name" varchar(120) DEFAULT '' NOT NULL,
	"contact" varchar(254) DEFAULT '' NOT NULL,
	"status" varchar(10) DEFAULT 'pending' NOT NULL,
	"created_by_user_id" varchar(128) NOT NULL,
	"accepted_by_user_id" varchar(128),
	"accepted_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement
CREATE TABLE IF NOT EXISTS "home_media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"home_id" uuid,
	"work_id" uuid,
	"room_id" uuid,
	"worker_id" uuid,
	"object_path" text NOT NULL,
	"original_name" varchar(255) NOT NULL,
	"content_type" varchar(120) NOT NULL,
	"size" integer NOT NULL,
	"caption" varchar(300) DEFAULT '' NOT NULL,
	"phase" varchar(12) DEFAULT 'other' NOT NULL,
	"uploaded_by_user_id" varchar(128) NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"taken_at" timestamp with time zone,
	"taken_source" varchar(8),
	"client_meta" jsonb,
	"sha256" varchar(64) DEFAULT '' NOT NULL,
	"invite_id" uuid,
	"floor_level" integer,
	"room_kind" varchar(24),
	"shot_key" varchar(32)
);
--> statement
CREATE TABLE IF NOT EXISTS "home_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"home_id" uuid NOT NULL,
	"user_id" varchar(128) NOT NULL,
	"role" varchar(16) NOT NULL,
	"display_name" varchar(120) DEFAULT '' NOT NULL,
	"added_by_user_id" varchar(128),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement
CREATE TABLE IF NOT EXISTS "home_rooms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"home_id" uuid NOT NULL,
	"name" varchar(120) NOT NULL,
	"kind" varchar(24) DEFAULT 'other' NOT NULL,
	"floor" varchar(20) DEFAULT '' NOT NULL,
	"area_m2" integer,
	"condition" varchar(16) DEFAULT 'unknown' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement
CREATE TABLE IF NOT EXISTS "home_shares" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"home_id" uuid NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"label" varchar(120) DEFAULT '' NOT NULL,
	"level" varchar(12) NOT NULL,
	"scope" jsonb NOT NULL,
	"created_by_user_id" varchar(128) NOT NULL,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"last_opened_at" timestamp with time zone,
	"open_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement
CREATE TABLE IF NOT EXISTS "homes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"public_id" varchar(16) NOT NULL,
	"created_by_user_id" varchar(128) NOT NULL,
	"name" varchar(160) NOT NULL,
	"property_type" varchar(24) NOT NULL,
	"city" varchar(100) DEFAULT '' NOT NULL,
	"district" varchar(120) DEFAULT '' NOT NULL,
	"address" varchar(240) DEFAULT '' NOT NULL,
	"area_m2" integer,
	"room_count" integer,
	"floor" varchar(20) DEFAULT '' NOT NULL,
	"built_year" integer,
	"stage" varchar(16) DEFAULT 'living' NOT NULL,
	"cover_media_id" uuid,
	"current_work_id" uuid,
	"notes" text DEFAULT '' NOT NULL,
	"public_level" varchar(12) DEFAULT 'basic' NOT NULL,
	"public_show_address" boolean DEFAULT false NOT NULL,
	"public_show_photos" boolean DEFAULT false NOT NULL,
	"public_show_equipment" boolean DEFAULT false NOT NULL,
	"show_on_worker_profiles" boolean DEFAULT true NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement
CREATE TABLE IF NOT EXISTS "infrastructure_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"home_id" uuid NOT NULL,
	"room_id" uuid,
	"work_id" uuid,
	"media_id" uuid,
	"type" varchar(16) NOT NULL,
	"label" varchar(160) DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"points" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source" varchar(12) NOT NULL,
	"created_by_user_id" varchar(128) NOT NULL,
	"verified_by_user_id" varchar(128),
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement
CREATE TABLE IF NOT EXISTS "service_interests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar(128) NOT NULL,
	"kind" varchar(16) NOT NULL,
	"home_id" uuid,
	"contact" varchar(200) DEFAULT '' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement
CREATE TABLE IF NOT EXISTS "stage_photo_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"home_id" uuid NOT NULL,
	"work_id" uuid,
	"token_hash" varchar(64) NOT NULL,
	"permission" varchar(16) DEFAULT 'photos' NOT NULL,
	"label" varchar(120) DEFAULT '' NOT NULL,
	"created_by_user_id" varchar(128) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"max_uploads" integer,
	"upload_count" integer DEFAULT 0 NOT NULL,
	"revoked_at" timestamp with time zone,
	"last_used_at" timestamp with time zone
);
--> statement
CREATE TABLE IF NOT EXISTS "work_approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"work_id" uuid NOT NULL,
	"action" varchar(20) NOT NULL,
	"from_status" varchar(16) NOT NULL,
	"to_status" varchar(16) NOT NULL,
	"actor_user_id" varchar(128) NOT NULL,
	"actor_role" varchar(16) NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement
CREATE TABLE IF NOT EXISTS "work_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"work_id" uuid NOT NULL,
	"kind" varchar(12) NOT NULL,
	"body" text NOT NULL,
	"result" varchar(8),
	"author_user_id" varchar(128) NOT NULL,
	"author_role" varchar(16) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement
CREATE TABLE IF NOT EXISTS "work_participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"work_id" uuid NOT NULL,
	"worker_id" uuid NOT NULL,
	"role" varchar(16) DEFAULT 'lead' NOT NULL,
	"status" varchar(12) DEFAULT 'invited' NOT NULL,
	"via_team_id" uuid,
	"note" varchar(300) DEFAULT '' NOT NULL,
	"can_add_media" boolean DEFAULT true NOT NULL,
	"can_add_notes" boolean DEFAULT true NOT NULL,
	"can_edit" boolean,
	"added_by_user_id" varchar(128) NOT NULL,
	"invited_at" timestamp with time zone DEFAULT now() NOT NULL,
	"responded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement
CREATE TABLE IF NOT EXISTS "work_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"home_id" uuid NOT NULL,
	"room_id" uuid,
	"equipment_id" uuid,
	"title" varchar(200) NOT NULL,
	"category" varchar(20) DEFAULT 'general' NOT NULL,
	"kind" varchar(16) DEFAULT 'renovation' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"materials" text DEFAULT '' NOT NULL,
	"location" text DEFAULT '' NOT NULL,
	"start_date" date,
	"end_date" date,
	"status" varchar(16) DEFAULT 'planned' NOT NULL,
	"completed_at" timestamp with time zone,
	"confirmed_at" timestamp with time zone,
	"inspected_at" timestamp with time zone,
	"visibility" varchar(8) DEFAULT 'public' NOT NULL,
	"cost" numeric(14, 2),
	"currency" varchar(3) DEFAULT 'AZN' NOT NULL,
	"warranty_note" text DEFAULT '' NOT NULL,
	"smeta_project_id" uuid,
	"sort_order" integer,
	"template_key" varchar(32),
	"hidden_at" timestamp with time zone,
	"created_by_user_id" varchar(128) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement
CREATE TABLE IF NOT EXISTS "worker_memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"role" varchar(16) DEFAULT 'member' NOT NULL,
	"status" varchar(12) DEFAULT 'invited' NOT NULL,
	"invited_by_user_id" varchar(128),
	"joined_at" timestamp with time zone,
	"left_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement
CREATE TABLE IF NOT EXISTS "worker_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"work_id" uuid NOT NULL,
	"worker_id" uuid NOT NULL,
	"author_user_id" varchar(128) NOT NULL,
	"rating" smallint NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"reported_at" timestamp with time zone,
	"report_reason" varchar(300),
	"hidden_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement
CREATE TABLE IF NOT EXISTS "workers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" varchar(12) NOT NULL,
	"user_id" varchar(128),
	"manager_user_id" varchar(128),
	"display_name" varchar(160) NOT NULL,
	"specialties" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"city" varchar(100) DEFAULT '' NOT NULL,
	"service_area" varchar(200) DEFAULT '' NOT NULL,
	"about" text DEFAULT '' NOT NULL,
	"experience_years" integer,
	"photo_media_id" uuid,
	"phone" varchar(32) DEFAULT '' NOT NULL,
	"email" varchar(254) DEFAULT '' NOT NULL,
	"public_contact" boolean DEFAULT false NOT NULL,
	"legal_name" varchar(200) DEFAULT '' NOT NULL,
	"tax_id" varchar(20) DEFAULT '' NOT NULL,
	"status" varchar(16) DEFAULT 'active' NOT NULL,
	"merged_into_id" uuid,
	"created_by_user_id" varchar(128) NOT NULL,
	"identity_verified_at" timestamp with time zone,
	"identity_verified_by" varchar(128),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement
CREATE TABLE IF NOT EXISTS "construction_estimates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" varchar(128) NOT NULL,
	"name" varchar(200) NOT NULL,
	"data" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement
CREATE TABLE IF NOT EXISTS "listing_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"url" text,
	"url_hash" varchar(64),
	"portal" varchar(16),
	"source" varchar(8) NOT NULL,
	"deal_type" varchar(8) DEFAULT 'sale' NOT NULL,
	"city" varchar(100) DEFAULT '' NOT NULL,
	"district" varchar(120) DEFAULT '' NOT NULL,
	"area_m2" numeric(10, 2),
	"rooms" integer,
	"floor" integer,
	"floors_total" integer,
	"building_type" varchar(8) DEFAULT 'unknown' NOT NULL,
	"renovation" varchar(8) DEFAULT 'unknown' NOT NULL,
	"furnished" varchar(8) DEFAULT 'unknown' NOT NULL,
	"price" numeric(14, 2),
	"currency" varchar(3),
	"price_azn" numeric(14, 2),
	"title" varchar(300) DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"parsed" jsonb,
	"in_pool" boolean DEFAULT false NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" varchar(128) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement
CREATE TABLE IF NOT EXISTS "valuations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" varchar(128) NOT NULL,
	"subject_id" uuid NOT NULL,
	"comp_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"usd_rate" numeric(8, 4) NOT NULL,
	"result" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement
CREATE TABLE IF NOT EXISTS "price_quotes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_code" varchar(80) NOT NULL,
	"tier" varchar(10) DEFAULT 'any' NOT NULL,
	"price" numeric(12, 2) NOT NULL,
	"currency" varchar(3) DEFAULT 'AZN' NOT NULL,
	"source_kind" varchar(16) NOT NULL,
	"source_name" varchar(200) NOT NULL,
	"source_url" text,
	"observed_at" date NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_by_user_id" varchar(128) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement
CREATE TABLE IF NOT EXISTS "repair_estimates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" varchar(128) NOT NULL,
	"name" varchar(200) NOT NULL,
	"data" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement
CREATE TABLE IF NOT EXISTS "handover_protocols" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" varchar(24) NOT NULL,
	"created_by_user_id" varchar(128) NOT NULL,
	"creator_role" varchar(10) NOT NULL,
	"kind" varchar(10) DEFAULT 'sale' NOT NULL,
	"rental_id" uuid,
	"home_id" uuid,
	"base_protocol_id" uuid,
	"base_version" integer,
	"baseline" jsonb,
	"property_type" varchar(12) DEFAULT 'apartment' NOT NULL,
	"address" varchar(300) NOT NULL,
	"handover_date" date,
	"handover_time" varchar(5) DEFAULT '' NOT NULL,
	"status" varchar(12) DEFAULT 'draft' NOT NULL,
	"seller_name" varchar(160) DEFAULT '' NOT NULL,
	"seller_phone" varchar(40) DEFAULT '' NOT NULL,
	"buyer_name" varchar(160) DEFAULT '' NOT NULL,
	"buyer_phone" varchar(40) DEFAULT '' NOT NULL,
	"realtor_name" varchar(160) DEFAULT '' NOT NULL,
	"realtor_phone" varchar(40) DEFAULT '' NOT NULL,
	"realtor_agency" varchar(160) DEFAULT '' NOT NULL,
	"extras" jsonb NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"current_version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement
CREATE TABLE IF NOT EXISTS "protocol_approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"protocol_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"content_hash" varchar(64) NOT NULL,
	"role" varchar(10) NOT NULL,
	"user_id" varchar(128) NOT NULL,
	"decision" varchar(10) NOT NULL,
	"comment" text DEFAULT '' NOT NULL,
	"auth_level" varchar(10) NOT NULL,
	"auth_detail" varchar(160) DEFAULT '' NOT NULL,
	"ip" varchar(64) DEFAULT '' NOT NULL,
	"user_agent" varchar(300) DEFAULT '' NOT NULL,
	"manifest_hash" varchar(64) DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement
CREATE TABLE IF NOT EXISTS "protocol_defects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"protocol_id" uuid NOT NULL,
	"room_id" uuid,
	"text" text NOT NULL,
	"created_by_user_id" varchar(128) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement
CREATE TABLE IF NOT EXISTS "protocol_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"protocol_id" uuid NOT NULL,
	"user_id" varchar(128),
	"action" varchar(40) NOT NULL,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"prev_hash" varchar(64) DEFAULT '' NOT NULL,
	"hash" varchar(64) DEFAULT '' NOT NULL
);
--> statement
CREATE TABLE IF NOT EXISTS "protocol_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"protocol_id" uuid NOT NULL,
	"role" varchar(10) NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"created_by_user_id" varchar(128) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"used_by_user_id" varchar(128),
	"used_at" timestamp with time zone,
	"last_opened_at" timestamp with time zone
);
--> statement
CREATE TABLE IF NOT EXISTS "protocol_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"protocol_id" uuid NOT NULL,
	"room_id" uuid NOT NULL,
	"name" varchar(120) NOT NULL,
	"category" varchar(10) DEFAULT 'other' NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"condition" varchar(10),
	"note" text DEFAULT '' NOT NULL,
	"change" varchar(12),
	"prev_item_id" uuid,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement
CREATE TABLE IF NOT EXISTS "protocol_media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"protocol_id" uuid NOT NULL,
	"room_id" uuid,
	"defect_id" uuid,
	"target" varchar(10) DEFAULT 'room' NOT NULL,
	"item_id" uuid,
	"taken_at" timestamp with time zone,
	"taken_source" varchar(8),
	"meter_kind" varchar(10),
	"object_path" text NOT NULL,
	"content_type" varchar(100) NOT NULL,
	"size" integer NOT NULL,
	"original_name" varchar(255) DEFAULT '' NOT NULL,
	"caption" varchar(300) DEFAULT '' NOT NULL,
	"uploaded_by_user_id" varchar(128) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by_user_id" varchar(128),
	"sha256" varchar(64) DEFAULT '' NOT NULL,
	"client_meta" jsonb
);
--> statement
CREATE TABLE IF NOT EXISTS "protocol_participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"protocol_id" uuid NOT NULL,
	"user_id" varchar(128) NOT NULL,
	"role" varchar(10) NOT NULL,
	"can_edit" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement
CREATE TABLE IF NOT EXISTS "protocol_rooms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"protocol_id" uuid NOT NULL,
	"name" varchar(120) NOT NULL,
	"kind" varchar(12) DEFAULT 'other' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"condition" varchar(10),
	"note" text DEFAULT '' NOT NULL,
	"prev_room_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement
CREATE TABLE IF NOT EXISTS "protocol_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"protocol_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"revision" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	"content_hash" varchar(64) NOT NULL,
	"created_by_user_id" varchar(128) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"pdf_object_path" text,
	"pdf_created_at" timestamp with time zone,
	"manifest" jsonb,
	"manifest_hash" varchar(64) DEFAULT '' NOT NULL,
	"verify_code" varchar(40),
	"final_hash" varchar(64) DEFAULT '' NOT NULL,
	"pdf_sha256" varchar(64) DEFAULT '' NOT NULL
);
--> statement
CREATE TABLE IF NOT EXISTS "rental_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rental_id" uuid NOT NULL,
	"role" varchar(10) NOT NULL,
	"can_edit" boolean DEFAULT true NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"created_by_user_id" varchar(128) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"used_by_user_id" varchar(128),
	"used_at" timestamp with time zone,
	"last_opened_at" timestamp with time zone
);
--> statement
CREATE TABLE IF NOT EXISTS "rental_participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rental_id" uuid NOT NULL,
	"user_id" varchar(128) NOT NULL,
	"role" varchar(10) NOT NULL,
	"can_edit" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement
CREATE TABLE IF NOT EXISTS "rentals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" varchar(24) NOT NULL,
	"created_by_user_id" varchar(128) NOT NULL,
	"address" varchar(300) NOT NULL,
	"property_type" varchar(12) DEFAULT 'apartment' NOT NULL,
	"landlord_name" varchar(160) DEFAULT '' NOT NULL,
	"landlord_phone" varchar(40) DEFAULT '' NOT NULL,
	"tenant_name" varchar(160) DEFAULT '' NOT NULL,
	"tenant_phone" varchar(40) DEFAULT '' NOT NULL,
	"realtor_name" varchar(160) DEFAULT '' NOT NULL,
	"realtor_phone" varchar(40) DEFAULT '' NOT NULL,
	"start_date" date,
	"end_date" date,
	"monthly_rent" integer,
	"deposit" integer,
	"currency" varchar(3) DEFAULT 'AZN' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement
CREATE TABLE IF NOT EXISTS "finance_budget_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"total" numeric(14, 2) NOT NULL,
	"reason" varchar(16) NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"change_order_id" uuid,
	"created_by_user_id" varchar(128) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement
CREATE TABLE IF NOT EXISTS "finance_change_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"party_id" uuid,
	"title" varchar(200) NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"date" date NOT NULL,
	"media_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" varchar(16) DEFAULT 'proposed' NOT NULL,
	"proposed_by_user_id" varchar(128) NOT NULL,
	"decided_by_user_id" varchar(128),
	"decided_at" timestamp with time zone,
	"decision_note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement
CREATE TABLE IF NOT EXISTS "finance_expense_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"expense_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"name" varchar(200) NOT NULL,
	"quantity" numeric(14, 3),
	"unit" varchar(16) DEFAULT '' NOT NULL,
	"unit_price" numeric(14, 2),
	"line_total" numeric(14, 2) NOT NULL,
	"category" varchar(24),
	"kind" varchar(8),
	"note" text DEFAULT '' NOT NULL
);
--> statement
CREATE TABLE IF NOT EXISTS "finance_expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"home_id" uuid NOT NULL,
	"date" date NOT NULL,
	"category" varchar(24) NOT NULL,
	"description" varchar(300) NOT NULL,
	"party_id" uuid,
	"vendor_name" varchar(200) DEFAULT '' NOT NULL,
	"room_id" uuid,
	"subtotal" numeric(14, 2) NOT NULL,
	"discount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"tax" numeric(14, 2) DEFAULT '0' NOT NULL,
	"total" numeric(14, 2) NOT NULL,
	"payment_method" varchar(12) DEFAULT '' NOT NULL,
	"funded_by_party_id" uuid,
	"invoice_id" uuid,
	"entry_id" uuid,
	"work_id" uuid,
	"note" text DEFAULT '' NOT NULL,
	"status" varchar(10) DEFAULT 'pending' NOT NULL,
	"approved_by_user_id" varchar(128),
	"approved_at" timestamp with time zone,
	"void_reason" text,
	"idempotency_key" varchar(64),
	"created_by_user_id" varchar(128) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement
CREATE TABLE IF NOT EXISTS "finance_invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"home_id" uuid NOT NULL,
	"media_id" uuid NOT NULL,
	"sha256" varchar(64) DEFAULT '' NOT NULL,
	"status" varchar(12) DEFAULT 'uploaded' NOT NULL,
	"ai_result" jsonb,
	"ai_model" varchar(64),
	"ai_error" text,
	"confirmed" jsonb,
	"doc_number" varchar(80) DEFAULT '' NOT NULL,
	"vendor" varchar(200) DEFAULT '' NOT NULL,
	"doc_date" date,
	"total" numeric(14, 2),
	"duplicate_of_id" uuid,
	"expense_id" uuid,
	"uploaded_by_user_id" varchar(128) NOT NULL,
	"confirmed_by_user_id" varchar(128),
	"confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement
CREATE TABLE IF NOT EXISTS "finance_parties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"home_id" uuid NOT NULL,
	"name" varchar(160) NOT NULL,
	"role" varchar(12) NOT NULL,
	"phone" varchar(32) DEFAULT '' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"contract_amount" numeric(14, 2),
	"contract_note" text DEFAULT '' NOT NULL,
	"worker_id" uuid,
	"user_id" varchar(128),
	"invite_token_hash" varchar(64),
	"invite_expires_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"created_by_user_id" varchar(128) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement
CREATE TABLE IF NOT EXISTS "finance_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"home_id" uuid NOT NULL,
	"kind" varchar(8) NOT NULL,
	"date" date NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"party_id" uuid,
	"payee_name" varchar(200) DEFAULT '' NOT NULL,
	"payer_name" varchar(200) DEFAULT '' NOT NULL,
	"purpose" varchar(300) DEFAULT '' NOT NULL,
	"method" varchar(12) DEFAULT '' NOT NULL,
	"expense_id" uuid,
	"change_order_id" uuid,
	"proof_media_id" uuid,
	"status" varchar(10) DEFAULT 'recorded' NOT NULL,
	"confirmed_by_user_id" varchar(128),
	"confirmed_at" timestamp with time zone,
	"cancel_reason" text,
	"idempotency_key" varchar(64),
	"created_by_user_id" varchar(128) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement
CREATE TABLE IF NOT EXISTS "home_projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"home_id" uuid NOT NULL,
	"name" varchar(160) NOT NULL,
	"kind" varchar(16) DEFAULT 'construction' NOT NULL,
	"start_date" date,
	"end_date" date,
	"status" varchar(10) DEFAULT 'active' NOT NULL,
	"currency" varchar(3) DEFAULT 'AZN' NOT NULL,
	"smeta_project_id" uuid,
	"created_by_user_id" varchar(128) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement
CREATE TABLE IF NOT EXISTS "media_stage_tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"media_id" uuid NOT NULL,
	"home_id" uuid NOT NULL,
	"ai_status" varchar(12) DEFAULT 'queued' NOT NULL,
	"ai_stage" varchar(24),
	"ai_confidence" numeric(4, 3),
	"ai_room_kind" varchar(24),
	"ai_utility" varchar(16),
	"ai_utilities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"ai_work_type" varchar(24),
	"ai_evidence" text,
	"ai_model" varchar(64),
	"ai_error" text,
	"analyzed_sha256" varchar(64),
	"attempts" integer DEFAULT 0 NOT NULL,
	"claimed_at" timestamp with time zone,
	"analyzed_at" timestamp with time zone,
	"stage" varchar(24),
	"stage_status" varchar(14) DEFAULT 'ai_suggested' NOT NULL,
	"room_kind" varchar(24),
	"utility" varchar(16),
	"decided_by_user_id" varchar(128),
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement
CREATE TABLE IF NOT EXISTS "ai_estimate_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"estimate_id" uuid NOT NULL,
	"object_path" text NOT NULL,
	"original_name" varchar(255) NOT NULL,
	"content_type" varchar(120) NOT NULL,
	"size" integer NOT NULL,
	"sha256" varchar(64) DEFAULT '' NOT NULL,
	"kind" varchar(10) NOT NULL,
	"status" varchar(10) DEFAULT 'uploaded' NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement
CREATE TABLE IF NOT EXISTS "ai_estimate_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"estimate_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"reason" varchar(12) NOT NULL,
	"doc" jsonb NOT NULL,
	"totals" jsonb NOT NULL,
	"created_by_user_id" varchar(128) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement
CREATE TABLE IF NOT EXISTS "ai_estimates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" varchar(128) NOT NULL,
	"home_id" uuid,
	"name" varchar(200) NOT NULL,
	"kind" varchar(16) NOT NULL,
	"location" varchar(200) DEFAULT '' NOT NULL,
	"area_m2" integer,
	"floors" integer,
	"status" varchar(12) DEFAULT 'draft' NOT NULL,
	"ai_error" text,
	"ai_model" varchar(64),
	"doc" jsonb NOT NULL,
	"answers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ai_result" jsonb,
	"contractor" jsonb,
	"version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement
ALTER TABLE "change_orders" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
--> statement
ALTER TABLE "change_orders" ADD COLUMN IF NOT EXISTS "project_id" uuid NOT NULL;
--> statement
ALTER TABLE "change_orders" ADD COLUMN IF NOT EXISTS "room_id" uuid;
--> statement
ALTER TABLE "change_orders" ADD COLUMN IF NOT EXISTS "number" integer NOT NULL;
--> statement
ALTER TABLE "change_orders" ADD COLUMN IF NOT EXISTS "title" varchar(160) NOT NULL;
--> statement
ALTER TABLE "change_orders" ADD COLUMN IF NOT EXISTS "reason" varchar(1000) NOT NULL;
--> statement
ALTER TABLE "change_orders" ADD COLUMN IF NOT EXISTS "description" text;
--> statement
ALTER TABLE "change_orders" ADD COLUMN IF NOT EXISTS "labor_amount" numeric(14, 2) NOT NULL;
--> statement
ALTER TABLE "change_orders" ADD COLUMN IF NOT EXISTS "material_amount" numeric(14, 2) NOT NULL;
--> statement
ALTER TABLE "change_orders" ADD COLUMN IF NOT EXISTS "schedule_impact_days" integer DEFAULT 0 NOT NULL;
--> statement
ALTER TABLE "change_orders" ADD COLUMN IF NOT EXISTS "new_completion_date" date;
--> statement
ALTER TABLE "change_orders" ADD COLUMN IF NOT EXISTS "status" varchar(32) DEFAULT 'submitted' NOT NULL;
--> statement
ALTER TABLE "change_orders" ADD COLUMN IF NOT EXISTS "created_by" text NOT NULL;
--> statement
ALTER TABLE "change_orders" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement
ALTER TABLE "change_orders" ADD COLUMN IF NOT EXISTS "decided_by" text;
--> statement
ALTER TABLE "change_orders" ADD COLUMN IF NOT EXISTS "decided_at" timestamp with time zone;
--> statement
ALTER TABLE "change_orders" ADD COLUMN IF NOT EXISTS "decision_comment" text;
--> statement
ALTER TABLE "evidence_uploads" ADD COLUMN IF NOT EXISTS "object_path" text NOT NULL;
--> statement
ALTER TABLE "evidence_uploads" ADD COLUMN IF NOT EXISTS "user_id" text NOT NULL;
--> statement
ALTER TABLE "evidence_uploads" ADD COLUMN IF NOT EXISTS "original_name" varchar(255) NOT NULL;
--> statement
ALTER TABLE "evidence_uploads" ADD COLUMN IF NOT EXISTS "content_type" varchar(120) NOT NULL;
--> statement
ALTER TABLE "evidence_uploads" ADD COLUMN IF NOT EXISTS "size" integer NOT NULL;
--> statement
ALTER TABLE "evidence_uploads" ADD COLUMN IF NOT EXISTS "expires_at" timestamp with time zone NOT NULL;
--> statement
ALTER TABLE "evidence_uploads" ADD COLUMN IF NOT EXISTS "attached_at" timestamp with time zone;
--> statement
ALTER TABLE "renovation_milestones" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
--> statement
ALTER TABLE "renovation_milestones" ADD COLUMN IF NOT EXISTS "project_id" uuid NOT NULL;
--> statement
ALTER TABLE "renovation_milestones" ADD COLUMN IF NOT EXISTS "title" varchar(120) NOT NULL;
--> statement
ALTER TABLE "renovation_milestones" ADD COLUMN IF NOT EXISTS "description" text;
--> statement
ALTER TABLE "renovation_milestones" ADD COLUMN IF NOT EXISTS "planned_completion_date" date;
--> statement
ALTER TABLE "renovation_milestones" ADD COLUMN IF NOT EXISTS "status" varchar(32) DEFAULT 'planned' NOT NULL;
--> statement
ALTER TABLE "renovation_milestones" ADD COLUMN IF NOT EXISTS "note" text;
--> statement
ALTER TABLE "renovation_milestones" ADD COLUMN IF NOT EXISTS "accepted_at" timestamp with time zone;
--> statement
ALTER TABLE "renovation_milestones" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement
ALTER TABLE "passport_shares" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
--> statement
ALTER TABLE "passport_shares" ADD COLUMN IF NOT EXISTS "project_id" uuid NOT NULL;
--> statement
ALTER TABLE "passport_shares" ADD COLUMN IF NOT EXISTS "token_hash" text NOT NULL;
--> statement
ALTER TABLE "passport_shares" ADD COLUMN IF NOT EXISTS "include_financial" boolean DEFAULT false NOT NULL;
--> statement
ALTER TABLE "passport_shares" ADD COLUMN IF NOT EXISTS "expires_at" timestamp with time zone NOT NULL;
--> statement
ALTER TABLE "passport_shares" ADD COLUMN IF NOT EXISTS "revoked_at" timestamp with time zone;
--> statement
ALTER TABLE "passport_shares" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement
ALTER TABLE "project_media" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
--> statement
ALTER TABLE "project_media" ADD COLUMN IF NOT EXISTS "project_id" uuid NOT NULL;
--> statement
ALTER TABLE "project_media" ADD COLUMN IF NOT EXISTS "entity_type" varchar(24) NOT NULL;
--> statement
ALTER TABLE "project_media" ADD COLUMN IF NOT EXISTS "entity_id" uuid NOT NULL;
--> statement
ALTER TABLE "project_media" ADD COLUMN IF NOT EXISTS "object_path" text NOT NULL;
--> statement
ALTER TABLE "project_media" ADD COLUMN IF NOT EXISTS "original_name" varchar(255) NOT NULL;
--> statement
ALTER TABLE "project_media" ADD COLUMN IF NOT EXISTS "content_type" varchar(120) NOT NULL;
--> statement
ALTER TABLE "project_media" ADD COLUMN IF NOT EXISTS "size" integer NOT NULL;
--> statement
ALTER TABLE "project_media" ADD COLUMN IF NOT EXISTS "uploaded_by" text NOT NULL;
--> statement
ALTER TABLE "project_media" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement
ALTER TABLE "project_participants" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
--> statement
ALTER TABLE "project_participants" ADD COLUMN IF NOT EXISTS "project_id" uuid NOT NULL;
--> statement
ALTER TABLE "project_participants" ADD COLUMN IF NOT EXISTS "user_id" text;
--> statement
ALTER TABLE "project_participants" ADD COLUMN IF NOT EXISTS "invited_name" varchar(120) NOT NULL;
--> statement
ALTER TABLE "project_participants" ADD COLUMN IF NOT EXISTS "contact" varchar(254) NOT NULL;
--> statement
ALTER TABLE "project_participants" ADD COLUMN IF NOT EXISTS "role" varchar(24) NOT NULL;
--> statement
ALTER TABLE "project_participants" ADD COLUMN IF NOT EXISTS "invite_token_hash" text;
--> statement
ALTER TABLE "project_participants" ADD COLUMN IF NOT EXISTS "invite_expires_at" timestamp with time zone;
--> statement
ALTER TABLE "project_participants" ADD COLUMN IF NOT EXISTS "accepted_at" timestamp with time zone;
--> statement
ALTER TABLE "project_participants" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement
ALTER TABLE "project_payments" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
--> statement
ALTER TABLE "project_payments" ADD COLUMN IF NOT EXISTS "project_id" uuid NOT NULL;
--> statement
ALTER TABLE "project_payments" ADD COLUMN IF NOT EXISTS "title" varchar(160) NOT NULL;
--> statement
ALTER TABLE "project_payments" ADD COLUMN IF NOT EXISTS "amount" numeric(14, 2) NOT NULL;
--> statement
ALTER TABLE "project_payments" ADD COLUMN IF NOT EXISTS "currency" varchar(3) DEFAULT 'AZN' NOT NULL;
--> statement
ALTER TABLE "project_payments" ADD COLUMN IF NOT EXISTS "due_condition" varchar(250);
--> statement
ALTER TABLE "project_payments" ADD COLUMN IF NOT EXISTS "due_date" date;
--> statement
ALTER TABLE "project_payments" ADD COLUMN IF NOT EXISTS "status" varchar(32) DEFAULT 'planned' NOT NULL;
--> statement
ALTER TABLE "project_payments" ADD COLUMN IF NOT EXISTS "note" text;
--> statement
ALTER TABLE "project_payments" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement
ALTER TABLE "project_payments" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement
ALTER TABLE "renovation_projects" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
--> statement
ALTER TABLE "renovation_projects" ADD COLUMN IF NOT EXISTS "owner_user_id" text NOT NULL;
--> statement
ALTER TABLE "renovation_projects" ADD COLUMN IF NOT EXISTS "name" varchar(120) NOT NULL;
--> statement
ALTER TABLE "renovation_projects" ADD COLUMN IF NOT EXISTS "property_type" varchar(40) NOT NULL;
--> statement
ALTER TABLE "renovation_projects" ADD COLUMN IF NOT EXISTS "city" varchar(100) NOT NULL;
--> statement
ALTER TABLE "renovation_projects" ADD COLUMN IF NOT EXISTS "project_type" varchar(40) NOT NULL;
--> statement
ALTER TABLE "renovation_projects" ADD COLUMN IF NOT EXISTS "planned_start_date" date;
--> statement
ALTER TABLE "renovation_projects" ADD COLUMN IF NOT EXISTS "planned_completion_date" date;
--> statement
ALTER TABLE "renovation_projects" ADD COLUMN IF NOT EXISTS "budget" numeric(14, 2);
--> statement
ALTER TABLE "renovation_projects" ADD COLUMN IF NOT EXISTS "status" varchar(32) DEFAULT 'planning' NOT NULL;
--> statement
ALTER TABLE "renovation_projects" ADD COLUMN IF NOT EXISTS "scope_version" integer DEFAULT 1 NOT NULL;
--> statement
ALTER TABLE "renovation_projects" ADD COLUMN IF NOT EXISTS "scope_status" varchar(32) DEFAULT 'draft' NOT NULL;
--> statement
ALTER TABLE "renovation_projects" ADD COLUMN IF NOT EXISTS "owner_scope_approved_at" timestamp with time zone;
--> statement
ALTER TABLE "renovation_projects" ADD COLUMN IF NOT EXISTS "contractor_scope_approved_at" timestamp with time zone;
--> statement
ALTER TABLE "renovation_projects" ADD COLUMN IF NOT EXISTS "archived" boolean DEFAULT false NOT NULL;
--> statement
ALTER TABLE "renovation_projects" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement
ALTER TABLE "renovation_projects" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement
ALTER TABLE "renovation_rooms" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
--> statement
ALTER TABLE "renovation_rooms" ADD COLUMN IF NOT EXISTS "project_id" uuid NOT NULL;
--> statement
ALTER TABLE "renovation_rooms" ADD COLUMN IF NOT EXISTS "name" varchar(80) NOT NULL;
--> statement
ALTER TABLE "renovation_rooms" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement
ALTER TABLE "revision_requests" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
--> statement
ALTER TABLE "revision_requests" ADD COLUMN IF NOT EXISTS "project_id" uuid NOT NULL;
--> statement
ALTER TABLE "revision_requests" ADD COLUMN IF NOT EXISTS "milestone_id" uuid NOT NULL;
--> statement
ALTER TABLE "revision_requests" ADD COLUMN IF NOT EXISTS "title" varchar(160) NOT NULL;
--> statement
ALTER TABLE "revision_requests" ADD COLUMN IF NOT EXISTS "issue_description" varchar(1500) NOT NULL;
--> statement
ALTER TABLE "revision_requests" ADD COLUMN IF NOT EXISTS "priority" varchar(16) DEFAULT 'normal' NOT NULL;
--> statement
ALTER TABLE "revision_requests" ADD COLUMN IF NOT EXISTS "status" varchar(32) DEFAULT 'open' NOT NULL;
--> statement
ALTER TABLE "revision_requests" ADD COLUMN IF NOT EXISTS "response" text;
--> statement
ALTER TABLE "revision_requests" ADD COLUMN IF NOT EXISTS "created_by" text NOT NULL;
--> statement
ALTER TABLE "revision_requests" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement
ALTER TABLE "revision_requests" ADD COLUMN IF NOT EXISTS "resolved_at" timestamp with time zone;
--> statement
ALTER TABLE "scope_items" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
--> statement
ALTER TABLE "scope_items" ADD COLUMN IF NOT EXISTS "project_id" uuid NOT NULL;
--> statement
ALTER TABLE "scope_items" ADD COLUMN IF NOT EXISTS "room_id" uuid;
--> statement
ALTER TABLE "scope_items" ADD COLUMN IF NOT EXISTS "scope_version" integer DEFAULT 1 NOT NULL;
--> statement
ALTER TABLE "scope_items" ADD COLUMN IF NOT EXISTS "title" varchar(160) NOT NULL;
--> statement
ALTER TABLE "scope_items" ADD COLUMN IF NOT EXISTS "description" text;
--> statement
ALTER TABLE "scope_items" ADD COLUMN IF NOT EXISTS "inclusion_type" varchar(20) NOT NULL;
--> statement
ALTER TABLE "scope_items" ADD COLUMN IF NOT EXISTS "material_responsibility" varchar(24) NOT NULL;
--> statement
ALTER TABLE "scope_items" ADD COLUMN IF NOT EXISTS "labor_amount" numeric(14, 2);
--> statement
ALTER TABLE "scope_items" ADD COLUMN IF NOT EXISTS "material_estimate" numeric(14, 2);
--> statement
ALTER TABLE "scope_items" ADD COLUMN IF NOT EXISTS "warranty_months" integer;
--> statement
ALTER TABLE "scope_items" ADD COLUMN IF NOT EXISTS "status" varchar(24) DEFAULT 'draft' NOT NULL;
--> statement
ALTER TABLE "scope_items" ADD COLUMN IF NOT EXISTS "created_by" text NOT NULL;
--> statement
ALTER TABLE "scope_items" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement
ALTER TABLE "renovation_timeline_events" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
--> statement
ALTER TABLE "renovation_timeline_events" ADD COLUMN IF NOT EXISTS "project_id" uuid NOT NULL;
--> statement
ALTER TABLE "renovation_timeline_events" ADD COLUMN IF NOT EXISTS "actor_user_id" text NOT NULL;
--> statement
ALTER TABLE "renovation_timeline_events" ADD COLUMN IF NOT EXISTS "actor_role" varchar(24) NOT NULL;
--> statement
ALTER TABLE "renovation_timeline_events" ADD COLUMN IF NOT EXISTS "action" varchar(100) NOT NULL;
--> statement
ALTER TABLE "renovation_timeline_events" ADD COLUMN IF NOT EXISTS "detail" text NOT NULL;
--> statement
ALTER TABLE "renovation_timeline_events" ADD COLUMN IF NOT EXISTS "entity_type" varchar(40);
--> statement
ALTER TABLE "renovation_timeline_events" ADD COLUMN IF NOT EXISTS "entity_id" uuid;
--> statement
ALTER TABLE "renovation_timeline_events" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement
ALTER TABLE "smeta_change_orders" ADD COLUMN IF NOT EXISTS "project_id" uuid NOT NULL;
--> statement
ALTER TABLE "smeta_change_orders" ADD COLUMN IF NOT EXISTS "id" varchar(64) NOT NULL;
--> statement
ALTER TABLE "smeta_change_orders" ADD COLUMN IF NOT EXISTS "number" integer NOT NULL;
--> statement
ALTER TABLE "smeta_change_orders" ADD COLUMN IF NOT EXISTS "title" varchar(160) NOT NULL;
--> statement
ALTER TABLE "smeta_change_orders" ADD COLUMN IF NOT EXISTS "reason" varchar(1000) NOT NULL;
--> statement
ALTER TABLE "smeta_change_orders" ADD COLUMN IF NOT EXISTS "date" date NOT NULL;
--> statement
ALTER TABLE "smeta_change_orders" ADD COLUMN IF NOT EXISTS "requested_by" varchar(16) NOT NULL;
--> statement
ALTER TABLE "smeta_change_orders" ADD COLUMN IF NOT EXISTS "requested_by_name" varchar(120) NOT NULL;
--> statement
ALTER TABLE "smeta_change_orders" ADD COLUMN IF NOT EXISTS "category" varchar(24) NOT NULL;
--> statement
ALTER TABLE "smeta_change_orders" ADD COLUMN IF NOT EXISTS "material_delta" numeric(14, 2) NOT NULL;
--> statement
ALTER TABLE "smeta_change_orders" ADD COLUMN IF NOT EXISTS "labor_delta" numeric(14, 2) NOT NULL;
--> statement
ALTER TABLE "smeta_change_orders" ADD COLUMN IF NOT EXISTS "additional_cost" numeric(14, 2) NOT NULL;
--> statement
ALTER TABLE "smeta_change_orders" ADD COLUMN IF NOT EXISTS "status" varchar(16) NOT NULL;
--> statement
ALTER TABLE "smeta_change_orders" ADD COLUMN IF NOT EXISTS "photo_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement
ALTER TABLE "smeta_change_orders" ADD COLUMN IF NOT EXISTS "line_item_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement
ALTER TABLE "smeta_change_orders" ADD COLUMN IF NOT EXISTS "decided_at" timestamp with time zone;
--> statement
ALTER TABLE "smeta_change_orders" ADD COLUMN IF NOT EXISTS "decided_by" varchar(16);
--> statement
ALTER TABLE "smeta_change_orders" ADD COLUMN IF NOT EXISTS "decision_note" varchar(1000);
--> statement
ALTER TABLE "smeta_change_orders" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement
ALTER TABLE "smeta_client_approvals" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
--> statement
ALTER TABLE "smeta_client_approvals" ADD COLUMN IF NOT EXISTS "project_id" uuid NOT NULL;
--> statement
ALTER TABLE "smeta_client_approvals" ADD COLUMN IF NOT EXISTS "version" integer NOT NULL;
--> statement
ALTER TABLE "smeta_client_approvals" ADD COLUMN IF NOT EXISTS "name" varchar(120) NOT NULL;
--> statement
ALTER TABLE "smeta_client_approvals" ADD COLUMN IF NOT EXISTS "phone" varchar(32) NOT NULL;
--> statement
ALTER TABLE "smeta_client_approvals" ADD COLUMN IF NOT EXISTS "consent" boolean NOT NULL;
--> statement
ALTER TABLE "smeta_client_approvals" ADD COLUMN IF NOT EXISTS "total" numeric(14, 2) NOT NULL;
--> statement
ALTER TABLE "smeta_client_approvals" ADD COLUMN IF NOT EXISTS "ip_address" varchar(64);
--> statement
ALTER TABLE "smeta_client_approvals" ADD COLUMN IF NOT EXISTS "user_agent" varchar(300);
--> statement
ALTER TABLE "smeta_client_approvals" ADD COLUMN IF NOT EXISTS "approved_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement
ALTER TABLE "smeta_estimate_versions" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
--> statement
ALTER TABLE "smeta_estimate_versions" ADD COLUMN IF NOT EXISTS "project_id" uuid NOT NULL;
--> statement
ALTER TABLE "smeta_estimate_versions" ADD COLUMN IF NOT EXISTS "version" integer NOT NULL;
--> statement
ALTER TABLE "smeta_estimate_versions" ADD COLUMN IF NOT EXISTS "snapshot" jsonb NOT NULL;
--> statement
ALTER TABLE "smeta_estimate_versions" ADD COLUMN IF NOT EXISTS "public_snapshot" jsonb NOT NULL;
--> statement
ALTER TABLE "smeta_estimate_versions" ADD COLUMN IF NOT EXISTS "total" numeric(14, 2) NOT NULL;
--> statement
ALTER TABLE "smeta_estimate_versions" ADD COLUMN IF NOT EXISTS "sent_by" text NOT NULL;
--> statement
ALTER TABLE "smeta_estimate_versions" ADD COLUMN IF NOT EXISTS "sent_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement
ALTER TABLE "smeta_expenses" ADD COLUMN IF NOT EXISTS "project_id" uuid NOT NULL;
--> statement
ALTER TABLE "smeta_expenses" ADD COLUMN IF NOT EXISTS "id" varchar(64) NOT NULL;
--> statement
ALTER TABLE "smeta_expenses" ADD COLUMN IF NOT EXISTS "position" integer NOT NULL;
--> statement
ALTER TABLE "smeta_expenses" ADD COLUMN IF NOT EXISTS "date" date NOT NULL;
--> statement
ALTER TABLE "smeta_expenses" ADD COLUMN IF NOT EXISTS "kind" varchar(16) NOT NULL;
--> statement
ALTER TABLE "smeta_expenses" ADD COLUMN IF NOT EXISTS "category" varchar(24) NOT NULL;
--> statement
ALTER TABLE "smeta_expenses" ADD COLUMN IF NOT EXISTS "description" varchar(300) NOT NULL;
--> statement
ALTER TABLE "smeta_expenses" ADD COLUMN IF NOT EXISTS "vendor" varchar(160) NOT NULL;
--> statement
ALTER TABLE "smeta_expenses" ADD COLUMN IF NOT EXISTS "amount" numeric(14, 2) NOT NULL;
--> statement
ALTER TABLE "smeta_expenses" ADD COLUMN IF NOT EXISTS "payment_status" varchar(16) NOT NULL;
--> statement
ALTER TABLE "smeta_expenses" ADD COLUMN IF NOT EXISTS "receipt_id" varchar(64);
--> statement
ALTER TABLE "smeta_expenses" ADD COLUMN IF NOT EXISTS "line_item_id" varchar(64);
--> statement
ALTER TABLE "smeta_line_items" ADD COLUMN IF NOT EXISTS "project_id" uuid NOT NULL;
--> statement
ALTER TABLE "smeta_line_items" ADD COLUMN IF NOT EXISTS "id" varchar(64) NOT NULL;
--> statement
ALTER TABLE "smeta_line_items" ADD COLUMN IF NOT EXISTS "section_id" varchar(64) NOT NULL;
--> statement
ALTER TABLE "smeta_line_items" ADD COLUMN IF NOT EXISTS "position" integer NOT NULL;
--> statement
ALTER TABLE "smeta_line_items" ADD COLUMN IF NOT EXISTS "name" varchar(200) NOT NULL;
--> statement
ALTER TABLE "smeta_line_items" ADD COLUMN IF NOT EXISTS "zone" varchar(120) NOT NULL;
--> statement
ALTER TABLE "smeta_line_items" ADD COLUMN IF NOT EXISTS "unit" varchar(16) NOT NULL;
--> statement
ALTER TABLE "smeta_line_items" ADD COLUMN IF NOT EXISTS "quantity" numeric(14, 3) NOT NULL;
--> statement
ALTER TABLE "smeta_line_items" ADD COLUMN IF NOT EXISTS "material_unit_price" numeric(14, 4) NOT NULL;
--> statement
ALTER TABLE "smeta_line_items" ADD COLUMN IF NOT EXISTS "labor_unit_price" numeric(14, 4) NOT NULL;
--> statement
ALTER TABLE "smeta_line_items" ADD COLUMN IF NOT EXISTS "additional_cost" numeric(14, 2) NOT NULL;
--> statement
ALTER TABLE "smeta_line_items" ADD COLUMN IF NOT EXISTS "waste_percentage" numeric(7, 4) NOT NULL;
--> statement
ALTER TABLE "smeta_line_items" ADD COLUMN IF NOT EXISTS "margin_percentage" numeric(7, 4);
--> statement
ALTER TABLE "smeta_line_items" ADD COLUMN IF NOT EXISTS "price_source" jsonb NOT NULL;
--> statement
ALTER TABLE "smeta_line_items" ADD COLUMN IF NOT EXISTS "quantity_source" jsonb NOT NULL;
--> statement
ALTER TABLE "smeta_line_items" ADD COLUMN IF NOT EXISTS "status" varchar(16) NOT NULL;
--> statement
ALTER TABLE "smeta_line_items" ADD COLUMN IF NOT EXISTS "material_id" varchar(64);
--> statement
ALTER TABLE "smeta_line_items" ADD COLUMN IF NOT EXISTS "labor_rate_id" varchar(64);
--> statement
ALTER TABLE "smeta_measurements" ADD COLUMN IF NOT EXISTS "project_id" uuid NOT NULL;
--> statement
ALTER TABLE "smeta_measurements" ADD COLUMN IF NOT EXISTS "id" varchar(64) NOT NULL;
--> statement
ALTER TABLE "smeta_measurements" ADD COLUMN IF NOT EXISTS "position" integer NOT NULL;
--> statement
ALTER TABLE "smeta_measurements" ADD COLUMN IF NOT EXISTS "kind" varchar(16) NOT NULL;
--> statement
ALTER TABLE "smeta_measurements" ADD COLUMN IF NOT EXISTS "name" varchar(160) NOT NULL;
--> statement
ALTER TABLE "smeta_measurements" ADD COLUMN IF NOT EXISTS "value" numeric(14, 3) NOT NULL;
--> statement
ALTER TABLE "smeta_measurements" ADD COLUMN IF NOT EXISTS "unit" varchar(8) NOT NULL;
--> statement
ALTER TABLE "smeta_measurements" ADD COLUMN IF NOT EXISTS "confidence" numeric(4, 3) NOT NULL;
--> statement
ALTER TABLE "smeta_measurements" ADD COLUMN IF NOT EXISTS "source" varchar(250) NOT NULL;
--> statement
ALTER TABLE "smeta_measurements" ADD COLUMN IF NOT EXISTS "status" varchar(16) NOT NULL;
--> statement
ALTER TABLE "smeta_measurements" ADD COLUMN IF NOT EXISTS "room_id" varchar(64);
--> statement
ALTER TABLE "smeta_payment_milestones" ADD COLUMN IF NOT EXISTS "project_id" uuid NOT NULL;
--> statement
ALTER TABLE "smeta_payment_milestones" ADD COLUMN IF NOT EXISTS "id" varchar(64) NOT NULL;
--> statement
ALTER TABLE "smeta_payment_milestones" ADD COLUMN IF NOT EXISTS "position" integer NOT NULL;
--> statement
ALTER TABLE "smeta_payment_milestones" ADD COLUMN IF NOT EXISTS "title" varchar(160) NOT NULL;
--> statement
ALTER TABLE "smeta_payment_milestones" ADD COLUMN IF NOT EXISTS "share" numeric(7, 4) NOT NULL;
--> statement
ALTER TABLE "smeta_payment_milestones" ADD COLUMN IF NOT EXISTS "condition" varchar(250) NOT NULL;
--> statement
ALTER TABLE "smeta_payment_milestones" ADD COLUMN IF NOT EXISTS "status" varchar(16) NOT NULL;
--> statement
ALTER TABLE "smeta_photos" ADD COLUMN IF NOT EXISTS "project_id" uuid NOT NULL;
--> statement
ALTER TABLE "smeta_photos" ADD COLUMN IF NOT EXISTS "id" varchar(64) NOT NULL;
--> statement
ALTER TABLE "smeta_photos" ADD COLUMN IF NOT EXISTS "position" integer NOT NULL;
--> statement
ALTER TABLE "smeta_photos" ADD COLUMN IF NOT EXISTS "phase" varchar(8) NOT NULL;
--> statement
ALTER TABLE "smeta_photos" ADD COLUMN IF NOT EXISTS "date" date NOT NULL;
--> statement
ALTER TABLE "smeta_photos" ADD COLUMN IF NOT EXISTS "uploaded_by" varchar(120) NOT NULL;
--> statement
ALTER TABLE "smeta_photos" ADD COLUMN IF NOT EXISTS "note" varchar(500) NOT NULL;
--> statement
ALTER TABLE "smeta_photos" ADD COLUMN IF NOT EXISTS "room" varchar(120) NOT NULL;
--> statement
ALTER TABLE "smeta_photos" ADD COLUMN IF NOT EXISTS "category" varchar(24) NOT NULL;
--> statement
ALTER TABLE "smeta_photos" ADD COLUMN IF NOT EXISTS "line_item_id" varchar(64);
--> statement
ALTER TABLE "smeta_photos" ADD COLUMN IF NOT EXISTS "client_visible" boolean DEFAULT true NOT NULL;
--> statement
ALTER TABLE "smeta_photos" ADD COLUMN IF NOT EXISTS "object_path" text;
--> statement
ALTER TABLE "smeta_project_costs" ADD COLUMN IF NOT EXISTS "project_id" uuid NOT NULL;
--> statement
ALTER TABLE "smeta_project_costs" ADD COLUMN IF NOT EXISTS "id" varchar(64) NOT NULL;
--> statement
ALTER TABLE "smeta_project_costs" ADD COLUMN IF NOT EXISTS "position" integer NOT NULL;
--> statement
ALTER TABLE "smeta_project_costs" ADD COLUMN IF NOT EXISTS "label" varchar(160) NOT NULL;
--> statement
ALTER TABLE "smeta_project_costs" ADD COLUMN IF NOT EXISTS "amount" numeric(14, 2) NOT NULL;
--> statement
ALTER TABLE "smeta_projects" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
--> statement
ALTER TABLE "smeta_projects" ADD COLUMN IF NOT EXISTS "owner_user_id" text NOT NULL;
--> statement
ALTER TABLE "smeta_projects" ADD COLUMN IF NOT EXISTS "home_id" uuid;
--> statement
ALTER TABLE "smeta_projects" ADD COLUMN IF NOT EXISTS "name" varchar(120) NOT NULL;
--> statement
ALTER TABLE "smeta_projects" ADD COLUMN IF NOT EXISTS "district" varchar(100) NOT NULL;
--> statement
ALTER TABLE "smeta_projects" ADD COLUMN IF NOT EXISTS "address" varchar(250) NOT NULL;
--> statement
ALTER TABLE "smeta_projects" ADD COLUMN IF NOT EXISTS "property_kind" varchar(16) NOT NULL;
--> statement
ALTER TABLE "smeta_projects" ADD COLUMN IF NOT EXISTS "renovation_kind" varchar(16) NOT NULL;
--> statement
ALTER TABLE "smeta_projects" ADD COLUMN IF NOT EXISTS "quality" varchar(16) NOT NULL;
--> statement
ALTER TABLE "smeta_projects" ADD COLUMN IF NOT EXISTS "area_m2" numeric(10, 2) NOT NULL;
--> statement
ALTER TABLE "smeta_projects" ADD COLUMN IF NOT EXISTS "start_date" date NOT NULL;
--> statement
ALTER TABLE "smeta_projects" ADD COLUMN IF NOT EXISTS "end_date" date NOT NULL;
--> statement
ALTER TABLE "smeta_projects" ADD COLUMN IF NOT EXISTS "client_name" varchar(120) NOT NULL;
--> statement
ALTER TABLE "smeta_projects" ADD COLUMN IF NOT EXISTS "client_phone" varchar(32) NOT NULL;
--> statement
ALTER TABLE "smeta_projects" ADD COLUMN IF NOT EXISTS "client_email" varchar(254);
--> statement
ALTER TABLE "smeta_projects" ADD COLUMN IF NOT EXISTS "contractor" jsonb NOT NULL;
--> statement
ALTER TABLE "smeta_projects" ADD COLUMN IF NOT EXISTS "completion" integer DEFAULT 0 NOT NULL;
--> statement
ALTER TABLE "smeta_projects" ADD COLUMN IF NOT EXISTS "default_margin_percentage" numeric(7, 4) NOT NULL;
--> statement
ALTER TABLE "smeta_projects" ADD COLUMN IF NOT EXISTS "status" varchar(32) DEFAULT 'draft' NOT NULL;
--> statement
ALTER TABLE "smeta_projects" ADD COLUMN IF NOT EXISTS "estimate_id" varchar(64) NOT NULL;
--> statement
ALTER TABLE "smeta_projects" ADD COLUMN IF NOT EXISTS "estimate_version" integer DEFAULT 1 NOT NULL;
--> statement
ALTER TABLE "smeta_projects" ADD COLUMN IF NOT EXISTS "estimate_created_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement
ALTER TABLE "smeta_projects" ADD COLUMN IF NOT EXISTS "valid_until" date NOT NULL;
--> statement
ALTER TABLE "smeta_projects" ADD COLUMN IF NOT EXISTS "included" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement
ALTER TABLE "smeta_projects" ADD COLUMN IF NOT EXISTS "excluded" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement
ALTER TABLE "smeta_projects" ADD COLUMN IF NOT EXISTS "drawing" jsonb;
--> statement
ALTER TABLE "smeta_projects" ADD COLUMN IF NOT EXISTS "exports" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement
ALTER TABLE "smeta_projects" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement
ALTER TABLE "smeta_projects" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement
ALTER TABLE "smeta_receipts" ADD COLUMN IF NOT EXISTS "project_id" uuid NOT NULL;
--> statement
ALTER TABLE "smeta_receipts" ADD COLUMN IF NOT EXISTS "id" varchar(64) NOT NULL;
--> statement
ALTER TABLE "smeta_receipts" ADD COLUMN IF NOT EXISTS "file_name" varchar(255) NOT NULL;
--> statement
ALTER TABLE "smeta_receipts" ADD COLUMN IF NOT EXISTS "file_type" varchar(8) NOT NULL;
--> statement
ALTER TABLE "smeta_receipts" ADD COLUMN IF NOT EXISTS "uploaded_at" varchar(40) NOT NULL;
--> statement
ALTER TABLE "smeta_receipts" ADD COLUMN IF NOT EXISTS "object_path" text;
--> statement
ALTER TABLE "smeta_receipts" ADD COLUMN IF NOT EXISTS "ai_suggestion" jsonb;
--> statement
ALTER TABLE "smeta_revision_requests" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
--> statement
ALTER TABLE "smeta_revision_requests" ADD COLUMN IF NOT EXISTS "project_id" uuid NOT NULL;
--> statement
ALTER TABLE "smeta_revision_requests" ADD COLUMN IF NOT EXISTS "version" integer NOT NULL;
--> statement
ALTER TABLE "smeta_revision_requests" ADD COLUMN IF NOT EXISTS "name" varchar(120) NOT NULL;
--> statement
ALTER TABLE "smeta_revision_requests" ADD COLUMN IF NOT EXISTS "message" varchar(1500) NOT NULL;
--> statement
ALTER TABLE "smeta_revision_requests" ADD COLUMN IF NOT EXISTS "ip_address" varchar(64);
--> statement
ALTER TABLE "smeta_revision_requests" ADD COLUMN IF NOT EXISTS "user_agent" varchar(300);
--> statement
ALTER TABLE "smeta_revision_requests" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement
ALTER TABLE "smeta_estimate_sections" ADD COLUMN IF NOT EXISTS "project_id" uuid NOT NULL;
--> statement
ALTER TABLE "smeta_estimate_sections" ADD COLUMN IF NOT EXISTS "id" varchar(64) NOT NULL;
--> statement
ALTER TABLE "smeta_estimate_sections" ADD COLUMN IF NOT EXISTS "position" integer NOT NULL;
--> statement
ALTER TABLE "smeta_estimate_sections" ADD COLUMN IF NOT EXISTS "category" varchar(24) NOT NULL;
--> statement
ALTER TABLE "smeta_estimate_sections" ADD COLUMN IF NOT EXISTS "title" varchar(120) NOT NULL;
--> statement
ALTER TABLE "smeta_shares" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
--> statement
ALTER TABLE "smeta_shares" ADD COLUMN IF NOT EXISTS "project_id" uuid NOT NULL;
--> statement
ALTER TABLE "smeta_shares" ADD COLUMN IF NOT EXISTS "token" varchar(64) NOT NULL;
--> statement
ALTER TABLE "smeta_shares" ADD COLUMN IF NOT EXISTS "version" integer NOT NULL;
--> statement
ALTER TABLE "smeta_shares" ADD COLUMN IF NOT EXISTS "client_name" varchar(120) NOT NULL;
--> statement
ALTER TABLE "smeta_shares" ADD COLUMN IF NOT EXISTS "phone" varchar(32) NOT NULL;
--> statement
ALTER TABLE "smeta_shares" ADD COLUMN IF NOT EXISTS "email" varchar(254);
--> statement
ALTER TABLE "smeta_shares" ADD COLUMN IF NOT EXISTS "message" varchar(2000) NOT NULL;
--> statement
ALTER TABLE "smeta_shares" ADD COLUMN IF NOT EXISTS "notify_on_approve" boolean DEFAULT true NOT NULL;
--> statement
ALTER TABLE "smeta_shares" ADD COLUMN IF NOT EXISTS "attach_pdf" boolean DEFAULT false NOT NULL;
--> statement
ALTER TABLE "smeta_shares" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement
ALTER TABLE "smeta_shares" ADD COLUMN IF NOT EXISTS "sent_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement
ALTER TABLE "smeta_shares" ADD COLUMN IF NOT EXISTS "expires_at" timestamp with time zone NOT NULL;
--> statement
ALTER TABLE "smeta_shares" ADD COLUMN IF NOT EXISTS "revoked_at" timestamp with time zone;
--> statement
ALTER TABLE "passport_works" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
--> statement
ALTER TABLE "passport_works" ADD COLUMN IF NOT EXISTS "passport_id" uuid NOT NULL;
--> statement
ALTER TABLE "passport_works" ADD COLUMN IF NOT EXISTS "position" integer DEFAULT 0 NOT NULL;
--> statement
ALTER TABLE "passport_works" ADD COLUMN IF NOT EXISTS "title" text NOT NULL;
--> statement
ALTER TABLE "passport_works" ADD COLUMN IF NOT EXISTS "start_date" date;
--> statement
ALTER TABLE "passport_works" ADD COLUMN IF NOT EXISTS "end_date" date;
--> statement
ALTER TABLE "passport_works" ADD COLUMN IF NOT EXISTS "contractor_name" text DEFAULT '' NOT NULL;
--> statement
ALTER TABLE "passport_works" ADD COLUMN IF NOT EXISTS "contractor_phone" varchar(32) DEFAULT '' NOT NULL;
--> statement
ALTER TABLE "passport_works" ADD COLUMN IF NOT EXISTS "description" text DEFAULT '' NOT NULL;
--> statement
ALTER TABLE "passport_works" ADD COLUMN IF NOT EXISTS "materials" text DEFAULT '' NOT NULL;
--> statement
ALTER TABLE "passport_works" ADD COLUMN IF NOT EXISTS "before_photo_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement
ALTER TABLE "passport_works" ADD COLUMN IF NOT EXISTS "after_photo_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement
ALTER TABLE "passport_works" ADD COLUMN IF NOT EXISTS "contractor_token_hash" varchar(64);
--> statement
ALTER TABLE "passport_works" ADD COLUMN IF NOT EXISTS "contractor_confirmed_at" timestamp with time zone;
--> statement
ALTER TABLE "passport_works" ADD COLUMN IF NOT EXISTS "contractor_confirmed_name" text;
--> statement
ALTER TABLE "passport_works" ADD COLUMN IF NOT EXISTS "contractor_note" text;
--> statement
ALTER TABLE "passport_works" ADD COLUMN IF NOT EXISTS "handover_status" varchar(12) DEFAULT 'pending' NOT NULL;
--> statement
ALTER TABLE "passport_works" ADD COLUMN IF NOT EXISTS "owner_decided_at" timestamp with time zone;
--> statement
ALTER TABLE "passport_works" ADD COLUMN IF NOT EXISTS "owner_decided_name" text;
--> statement
ALTER TABLE "passport_works" ADD COLUMN IF NOT EXISTS "owner_note" text;
--> statement
ALTER TABLE "passport_works" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement
ALTER TABLE "passport_works" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement
ALTER TABLE "property_passports" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
--> statement
ALTER TABLE "property_passports" ADD COLUMN IF NOT EXISTS "public_id" varchar(16) NOT NULL;
--> statement
ALTER TABLE "property_passports" ADD COLUMN IF NOT EXISTS "owner_user_id" varchar(128) NOT NULL;
--> statement
ALTER TABLE "property_passports" ADD COLUMN IF NOT EXISTS "listing_id" uuid;
--> statement
ALTER TABLE "property_passports" ADD COLUMN IF NOT EXISTS "title" text NOT NULL;
--> statement
ALTER TABLE "property_passports" ADD COLUMN IF NOT EXISTS "deal_type" varchar(12) DEFAULT 'sale' NOT NULL;
--> statement
ALTER TABLE "property_passports" ADD COLUMN IF NOT EXISTS "property_kind" varchar(20) NOT NULL;
--> statement
ALTER TABLE "property_passports" ADD COLUMN IF NOT EXISTS "district" text NOT NULL;
--> statement
ALTER TABLE "property_passports" ADD COLUMN IF NOT EXISTS "address" text DEFAULT '' NOT NULL;
--> statement
ALTER TABLE "property_passports" ADD COLUMN IF NOT EXISTS "rooms" integer;
--> statement
ALTER TABLE "property_passports" ADD COLUMN IF NOT EXISTS "area_m2" numeric(10, 2);
--> statement
ALTER TABLE "property_passports" ADD COLUMN IF NOT EXISTS "price" numeric(14, 2);
--> statement
ALTER TABLE "property_passports" ADD COLUMN IF NOT EXISTS "currency" varchar(3) DEFAULT 'AZN' NOT NULL;
--> statement
ALTER TABLE "property_passports" ADD COLUMN IF NOT EXISTS "listing_urls" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement
ALTER TABLE "property_passports" ADD COLUMN IF NOT EXISTS "photo_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement
ALTER TABLE "property_passports" ADD COLUMN IF NOT EXISTS "realtor" jsonb NOT NULL;
--> statement
ALTER TABLE "property_passports" ADD COLUMN IF NOT EXISTS "status" varchar(12) DEFAULT 'draft' NOT NULL;
--> statement
ALTER TABLE "property_passports" ADD COLUMN IF NOT EXISTS "owner_name" text DEFAULT '' NOT NULL;
--> statement
ALTER TABLE "property_passports" ADD COLUMN IF NOT EXISTS "owner_phone" varchar(32) DEFAULT '' NOT NULL;
--> statement
ALTER TABLE "property_passports" ADD COLUMN IF NOT EXISTS "owner_token_hash" varchar(64);
--> statement
ALTER TABLE "property_passports" ADD COLUMN IF NOT EXISTS "published_at" timestamp with time zone;
--> statement
ALTER TABLE "property_passports" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement
ALTER TABLE "property_passports" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement
ALTER TABLE "realtor_agents" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
--> statement
ALTER TABLE "realtor_agents" ADD COLUMN IF NOT EXISTS "owner_user_id" varchar(128) NOT NULL;
--> statement
ALTER TABLE "realtor_agents" ADD COLUMN IF NOT EXISTS "full_name" text NOT NULL;
--> statement
ALTER TABLE "realtor_agents" ADD COLUMN IF NOT EXISTS "phone" varchar(32) DEFAULT '' NOT NULL;
--> statement
ALTER TABLE "realtor_agents" ADD COLUMN IF NOT EXISTS "email" varchar(254) DEFAULT '' NOT NULL;
--> statement
ALTER TABLE "realtor_agents" ADD COLUMN IF NOT EXISTS "active" boolean DEFAULT true NOT NULL;
--> statement
ALTER TABLE "realtor_agents" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement
ALTER TABLE "realtor_appointments" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
--> statement
ALTER TABLE "realtor_appointments" ADD COLUMN IF NOT EXISTS "owner_user_id" varchar(128) NOT NULL;
--> statement
ALTER TABLE "realtor_appointments" ADD COLUMN IF NOT EXISTS "lead_id" uuid;
--> statement
ALTER TABLE "realtor_appointments" ADD COLUMN IF NOT EXISTS "listing_id" uuid;
--> statement
ALTER TABLE "realtor_appointments" ADD COLUMN IF NOT EXISTS "agent_id" uuid;
--> statement
ALTER TABLE "realtor_appointments" ADD COLUMN IF NOT EXISTS "starts_at" timestamp with time zone NOT NULL;
--> statement
ALTER TABLE "realtor_appointments" ADD COLUMN IF NOT EXISTS "duration_min" integer DEFAULT 30 NOT NULL;
--> statement
ALTER TABLE "realtor_appointments" ADD COLUMN IF NOT EXISTS "status" varchar(16) DEFAULT 'planned' NOT NULL;
--> statement
ALTER TABLE "realtor_appointments" ADD COLUMN IF NOT EXISTS "notes" text DEFAULT '' NOT NULL;
--> statement
ALTER TABLE "realtor_appointments" ADD COLUMN IF NOT EXISTS "reminder_sent_at" timestamp with time zone;
--> statement
ALTER TABLE "realtor_appointments" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement
ALTER TABLE "realtor_appointments" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement
ALTER TABLE "realtor_events" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
--> statement
ALTER TABLE "realtor_events" ADD COLUMN IF NOT EXISTS "owner_user_id" varchar(128) NOT NULL;
--> statement
ALTER TABLE "realtor_events" ADD COLUMN IF NOT EXISTS "passport_id" uuid;
--> statement
ALTER TABLE "realtor_events" ADD COLUMN IF NOT EXISTS "listing_id" uuid;
--> statement
ALTER TABLE "realtor_events" ADD COLUMN IF NOT EXISTS "kind" varchar(20) NOT NULL;
--> statement
ALTER TABLE "realtor_events" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement
ALTER TABLE "realtor_leads" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
--> statement
ALTER TABLE "realtor_leads" ADD COLUMN IF NOT EXISTS "owner_user_id" varchar(128) NOT NULL;
--> statement
ALTER TABLE "realtor_leads" ADD COLUMN IF NOT EXISTS "agent_id" uuid;
--> statement
ALTER TABLE "realtor_leads" ADD COLUMN IF NOT EXISTS "listing_id" uuid;
--> statement
ALTER TABLE "realtor_leads" ADD COLUMN IF NOT EXISTS "full_name" text NOT NULL;
--> statement
ALTER TABLE "realtor_leads" ADD COLUMN IF NOT EXISTS "phone" varchar(32) DEFAULT '' NOT NULL;
--> statement
ALTER TABLE "realtor_leads" ADD COLUMN IF NOT EXISTS "source" varchar(16) NOT NULL;
--> statement
ALTER TABLE "realtor_leads" ADD COLUMN IF NOT EXISTS "status" varchar(16) DEFAULT 'new' NOT NULL;
--> statement
ALTER TABLE "realtor_leads" ADD COLUMN IF NOT EXISTS "deal_type" varchar(12);
--> statement
ALTER TABLE "realtor_leads" ADD COLUMN IF NOT EXISTS "district" text DEFAULT '' NOT NULL;
--> statement
ALTER TABLE "realtor_leads" ADD COLUMN IF NOT EXISTS "rooms" integer;
--> statement
ALTER TABLE "realtor_leads" ADD COLUMN IF NOT EXISTS "budget_min" numeric(14, 2);
--> statement
ALTER TABLE "realtor_leads" ADD COLUMN IF NOT EXISTS "budget_max" numeric(14, 2);
--> statement
ALTER TABLE "realtor_leads" ADD COLUMN IF NOT EXISTS "timeframe" text DEFAULT '' NOT NULL;
--> statement
ALTER TABLE "realtor_leads" ADD COLUMN IF NOT EXISTS "notes" text DEFAULT '' NOT NULL;
--> statement
ALTER TABLE "realtor_leads" ADD COLUMN IF NOT EXISTS "next_action" text DEFAULT '' NOT NULL;
--> statement
ALTER TABLE "realtor_leads" ADD COLUMN IF NOT EXISTS "next_action_at" timestamp with time zone;
--> statement
ALTER TABLE "realtor_leads" ADD COLUMN IF NOT EXISTS "reminder_sent_at" timestamp with time zone;
--> statement
ALTER TABLE "realtor_leads" ADD COLUMN IF NOT EXISTS "last_contact_at" timestamp with time zone;
--> statement
ALTER TABLE "realtor_leads" ADD COLUMN IF NOT EXISTS "last_inbound_at" timestamp with time zone;
--> statement
ALTER TABLE "realtor_leads" ADD COLUMN IF NOT EXISTS "follow_up_sent_at" timestamp with time zone;
--> statement
ALTER TABLE "realtor_leads" ADD COLUMN IF NOT EXISTS "bot_state" jsonb;
--> statement
ALTER TABLE "realtor_leads" ADD COLUMN IF NOT EXISTS "ready_for_meeting" boolean DEFAULT false NOT NULL;
--> statement
ALTER TABLE "realtor_leads" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement
ALTER TABLE "realtor_leads" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement
ALTER TABLE "realtor_listings" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
--> statement
ALTER TABLE "realtor_listings" ADD COLUMN IF NOT EXISTS "owner_user_id" varchar(128) NOT NULL;
--> statement
ALTER TABLE "realtor_listings" ADD COLUMN IF NOT EXISTS "agent_id" uuid;
--> statement
ALTER TABLE "realtor_listings" ADD COLUMN IF NOT EXISTS "title" text NOT NULL;
--> statement
ALTER TABLE "realtor_listings" ADD COLUMN IF NOT EXISTS "deal_type" varchar(12) NOT NULL;
--> statement
ALTER TABLE "realtor_listings" ADD COLUMN IF NOT EXISTS "property_kind" varchar(20) NOT NULL;
--> statement
ALTER TABLE "realtor_listings" ADD COLUMN IF NOT EXISTS "district" text NOT NULL;
--> statement
ALTER TABLE "realtor_listings" ADD COLUMN IF NOT EXISTS "address" text DEFAULT '' NOT NULL;
--> statement
ALTER TABLE "realtor_listings" ADD COLUMN IF NOT EXISTS "rooms" integer;
--> statement
ALTER TABLE "realtor_listings" ADD COLUMN IF NOT EXISTS "area_m2" numeric(10, 2);
--> statement
ALTER TABLE "realtor_listings" ADD COLUMN IF NOT EXISTS "floor" varchar(20) DEFAULT '' NOT NULL;
--> statement
ALTER TABLE "realtor_listings" ADD COLUMN IF NOT EXISTS "price" numeric(14, 2);
--> statement
ALTER TABLE "realtor_listings" ADD COLUMN IF NOT EXISTS "currency" varchar(3) DEFAULT 'AZN' NOT NULL;
--> statement
ALTER TABLE "realtor_listings" ADD COLUMN IF NOT EXISTS "status" varchar(12) DEFAULT 'active' NOT NULL;
--> statement
ALTER TABLE "realtor_listings" ADD COLUMN IF NOT EXISTS "description" text DEFAULT '' NOT NULL;
--> statement
ALTER TABLE "realtor_listings" ADD COLUMN IF NOT EXISTS "external_links" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement
ALTER TABLE "realtor_listings" ADD COLUMN IF NOT EXISTS "photo_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement
ALTER TABLE "realtor_listings" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement
ALTER TABLE "realtor_listings" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement
ALTER TABLE "realtor_media" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
--> statement
ALTER TABLE "realtor_media" ADD COLUMN IF NOT EXISTS "owner_user_id" varchar(128) NOT NULL;
--> statement
ALTER TABLE "realtor_media" ADD COLUMN IF NOT EXISTS "object_path" text NOT NULL;
--> statement
ALTER TABLE "realtor_media" ADD COLUMN IF NOT EXISTS "original_name" text NOT NULL;
--> statement
ALTER TABLE "realtor_media" ADD COLUMN IF NOT EXISTS "content_type" varchar(120) NOT NULL;
--> statement
ALTER TABLE "realtor_media" ADD COLUMN IF NOT EXISTS "size" integer NOT NULL;
--> statement
ALTER TABLE "realtor_media" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement
ALTER TABLE "realtor_messages" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
--> statement
ALTER TABLE "realtor_messages" ADD COLUMN IF NOT EXISTS "owner_user_id" varchar(128) NOT NULL;
--> statement
ALTER TABLE "realtor_messages" ADD COLUMN IF NOT EXISTS "lead_id" uuid;
--> statement
ALTER TABLE "realtor_messages" ADD COLUMN IF NOT EXISTS "direction" varchar(4) NOT NULL;
--> statement
ALTER TABLE "realtor_messages" ADD COLUMN IF NOT EXISTS "kind" varchar(20) NOT NULL;
--> statement
ALTER TABLE "realtor_messages" ADD COLUMN IF NOT EXISTS "body" text NOT NULL;
--> statement
ALTER TABLE "realtor_messages" ADD COLUMN IF NOT EXISTS "status" varchar(12) NOT NULL;
--> statement
ALTER TABLE "realtor_messages" ADD COLUMN IF NOT EXISTS "wa_message_id" varchar(128);
--> statement
ALTER TABLE "realtor_messages" ADD COLUMN IF NOT EXISTS "error" text;
--> statement
ALTER TABLE "realtor_messages" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement
ALTER TABLE "realtor_notifications" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
--> statement
ALTER TABLE "realtor_notifications" ADD COLUMN IF NOT EXISTS "owner_user_id" varchar(128) NOT NULL;
--> statement
ALTER TABLE "realtor_notifications" ADD COLUMN IF NOT EXISTS "kind" varchar(24) NOT NULL;
--> statement
ALTER TABLE "realtor_notifications" ADD COLUMN IF NOT EXISTS "title" text NOT NULL;
--> statement
ALTER TABLE "realtor_notifications" ADD COLUMN IF NOT EXISTS "body" text DEFAULT '' NOT NULL;
--> statement
ALTER TABLE "realtor_notifications" ADD COLUMN IF NOT EXISTS "href" text DEFAULT '' NOT NULL;
--> statement
ALTER TABLE "realtor_notifications" ADD COLUMN IF NOT EXISTS "read_at" timestamp with time zone;
--> statement
ALTER TABLE "realtor_notifications" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement
ALTER TABLE "realtor_profiles" ADD COLUMN IF NOT EXISTS "user_id" varchar(128) NOT NULL;
--> statement
ALTER TABLE "realtor_profiles" ADD COLUMN IF NOT EXISTS "full_name" text NOT NULL;
--> statement
ALTER TABLE "realtor_profiles" ADD COLUMN IF NOT EXISTS "agency" text DEFAULT '' NOT NULL;
--> statement
ALTER TABLE "realtor_profiles" ADD COLUMN IF NOT EXISTS "phone" varchar(32) DEFAULT '' NOT NULL;
--> statement
ALTER TABLE "realtor_profiles" ADD COLUMN IF NOT EXISTS "whatsapp" varchar(32) DEFAULT '' NOT NULL;
--> statement
ALTER TABLE "realtor_profiles" ADD COLUMN IF NOT EXISTS "instagram" varchar(120) DEFAULT '' NOT NULL;
--> statement
ALTER TABLE "realtor_profiles" ADD COLUMN IF NOT EXISTS "bio" text DEFAULT '' NOT NULL;
--> statement
ALTER TABLE "realtor_profiles" ADD COLUMN IF NOT EXISTS "photo_media_id" uuid;
--> statement
ALTER TABLE "realtor_profiles" ADD COLUMN IF NOT EXISTS "logo_media_id" uuid;
--> statement
ALTER TABLE "realtor_profiles" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement
ALTER TABLE "realtor_profiles" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement
ALTER TABLE "realtor_whatsapp_settings" ADD COLUMN IF NOT EXISTS "user_id" varchar(128) NOT NULL;
--> statement
ALTER TABLE "realtor_whatsapp_settings" ADD COLUMN IF NOT EXISTS "mode" varchar(12) DEFAULT 'manual' NOT NULL;
--> statement
ALTER TABLE "realtor_whatsapp_settings" ADD COLUMN IF NOT EXISTS "business_phone" varchar(32) DEFAULT '' NOT NULL;
--> statement
ALTER TABLE "realtor_whatsapp_settings" ADD COLUMN IF NOT EXISTS "phone_number_id" varchar(64);
--> statement
ALTER TABLE "realtor_whatsapp_settings" ADD COLUMN IF NOT EXISTS "access_token_enc" text;
--> statement
ALTER TABLE "realtor_whatsapp_settings" ADD COLUMN IF NOT EXISTS "auto_reply_enabled" boolean DEFAULT true NOT NULL;
--> statement
ALTER TABLE "realtor_whatsapp_settings" ADD COLUMN IF NOT EXISTS "greeting" text DEFAULT '' NOT NULL;
--> statement
ALTER TABLE "realtor_whatsapp_settings" ADD COLUMN IF NOT EXISTS "follow_up_enabled" boolean DEFAULT true NOT NULL;
--> statement
ALTER TABLE "realtor_whatsapp_settings" ADD COLUMN IF NOT EXISTS "follow_up_hours" integer DEFAULT 48 NOT NULL;
--> statement
ALTER TABLE "realtor_whatsapp_settings" ADD COLUMN IF NOT EXISTS "follow_up_text" text DEFAULT '' NOT NULL;
--> statement
ALTER TABLE "realtor_whatsapp_settings" ADD COLUMN IF NOT EXISTS "reminder_enabled" boolean DEFAULT true NOT NULL;
--> statement
ALTER TABLE "realtor_whatsapp_settings" ADD COLUMN IF NOT EXISTS "reminder_hours_before" integer DEFAULT 3 NOT NULL;
--> statement
ALTER TABLE "realtor_whatsapp_settings" ADD COLUMN IF NOT EXISTS "reminder_text" text DEFAULT '' NOT NULL;
--> statement
ALTER TABLE "realtor_whatsapp_settings" ADD COLUMN IF NOT EXISTS "workday_start_hour" integer DEFAULT 10 NOT NULL;
--> statement
ALTER TABLE "realtor_whatsapp_settings" ADD COLUMN IF NOT EXISTS "workday_end_hour" integer DEFAULT 19 NOT NULL;
--> statement
ALTER TABLE "realtor_whatsapp_settings" ADD COLUMN IF NOT EXISTS "follow_up_template" varchar(120) DEFAULT '' NOT NULL;
--> statement
ALTER TABLE "realtor_whatsapp_settings" ADD COLUMN IF NOT EXISTS "reminder_template" varchar(120) DEFAULT '' NOT NULL;
--> statement
ALTER TABLE "realtor_whatsapp_settings" ADD COLUMN IF NOT EXISTS "template_language" varchar(12) DEFAULT 'az' NOT NULL;
--> statement
ALTER TABLE "realtor_whatsapp_settings" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement
ALTER TABLE "equipment" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
--> statement
ALTER TABLE "equipment" ADD COLUMN IF NOT EXISTS "home_id" uuid NOT NULL;
--> statement
ALTER TABLE "equipment" ADD COLUMN IF NOT EXISTS "room_id" uuid;
--> statement
ALTER TABLE "equipment" ADD COLUMN IF NOT EXISTS "install_work_id" uuid;
--> statement
ALTER TABLE "equipment" ADD COLUMN IF NOT EXISTS "name" varchar(160) NOT NULL;
--> statement
ALTER TABLE "equipment" ADD COLUMN IF NOT EXISTS "category" varchar(20) DEFAULT 'other' NOT NULL;
--> statement
ALTER TABLE "equipment" ADD COLUMN IF NOT EXISTS "brand" varchar(80) DEFAULT '' NOT NULL;
--> statement
ALTER TABLE "equipment" ADD COLUMN IF NOT EXISTS "model" varchar(120) DEFAULT '' NOT NULL;
--> statement
ALTER TABLE "equipment" ADD COLUMN IF NOT EXISTS "serial_number" varchar(120) DEFAULT '' NOT NULL;
--> statement
ALTER TABLE "equipment" ADD COLUMN IF NOT EXISTS "installed_at" date;
--> statement
ALTER TABLE "equipment" ADD COLUMN IF NOT EXISTS "warranty_until" date;
--> statement
ALTER TABLE "equipment" ADD COLUMN IF NOT EXISTS "photo_media_id" uuid;
--> statement
ALTER TABLE "equipment" ADD COLUMN IF NOT EXISTS "notes" text DEFAULT '' NOT NULL;
--> statement
ALTER TABLE "equipment" ADD COLUMN IF NOT EXISTS "next_service_at" date;
--> statement
ALTER TABLE "equipment" ADD COLUMN IF NOT EXISTS "service_contact" text DEFAULT '' NOT NULL;
--> statement
ALTER TABLE "equipment" ADD COLUMN IF NOT EXISTS "created_by_user_id" varchar(128) NOT NULL;
--> statement
ALTER TABLE "equipment" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement
ALTER TABLE "equipment" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement
ALTER TABLE "home_audit" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
--> statement
ALTER TABLE "home_audit" ADD COLUMN IF NOT EXISTS "home_id" uuid;
--> statement
ALTER TABLE "home_audit" ADD COLUMN IF NOT EXISTS "worker_id" uuid;
--> statement
ALTER TABLE "home_audit" ADD COLUMN IF NOT EXISTS "actor_user_id" varchar(128) NOT NULL;
--> statement
ALTER TABLE "home_audit" ADD COLUMN IF NOT EXISTS "actor_role" varchar(16) NOT NULL;
--> statement
ALTER TABLE "home_audit" ADD COLUMN IF NOT EXISTS "action" varchar(40) NOT NULL;
--> statement
ALTER TABLE "home_audit" ADD COLUMN IF NOT EXISTS "entity_type" varchar(24) NOT NULL;
--> statement
ALTER TABLE "home_audit" ADD COLUMN IF NOT EXISTS "entity_id" uuid;
--> statement
ALTER TABLE "home_audit" ADD COLUMN IF NOT EXISTS "summary" varchar(300) DEFAULT '' NOT NULL;
--> statement
ALTER TABLE "home_audit" ADD COLUMN IF NOT EXISTS "changes" jsonb;
--> statement
ALTER TABLE "home_audit" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement
ALTER TABLE "home_invitations" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
--> statement
ALTER TABLE "home_invitations" ADD COLUMN IF NOT EXISTS "kind" varchar(8) NOT NULL;
--> statement
ALTER TABLE "home_invitations" ADD COLUMN IF NOT EXISTS "token_hash" varchar(64) NOT NULL;
--> statement
ALTER TABLE "home_invitations" ADD COLUMN IF NOT EXISTS "home_id" uuid;
--> statement
ALTER TABLE "home_invitations" ADD COLUMN IF NOT EXISTS "work_id" uuid;
--> statement
ALTER TABLE "home_invitations" ADD COLUMN IF NOT EXISTS "group_id" uuid;
--> statement
ALTER TABLE "home_invitations" ADD COLUMN IF NOT EXISTS "placeholder_worker_id" uuid;
--> statement
ALTER TABLE "home_invitations" ADD COLUMN IF NOT EXISTS "role" varchar(16) NOT NULL;
--> statement
ALTER TABLE "home_invitations" ADD COLUMN IF NOT EXISTS "name" varchar(120) DEFAULT '' NOT NULL;
--> statement
ALTER TABLE "home_invitations" ADD COLUMN IF NOT EXISTS "contact" varchar(254) DEFAULT '' NOT NULL;
--> statement
ALTER TABLE "home_invitations" ADD COLUMN IF NOT EXISTS "status" varchar(10) DEFAULT 'pending' NOT NULL;
--> statement
ALTER TABLE "home_invitations" ADD COLUMN IF NOT EXISTS "created_by_user_id" varchar(128) NOT NULL;
--> statement
ALTER TABLE "home_invitations" ADD COLUMN IF NOT EXISTS "accepted_by_user_id" varchar(128);
--> statement
ALTER TABLE "home_invitations" ADD COLUMN IF NOT EXISTS "accepted_at" timestamp with time zone;
--> statement
ALTER TABLE "home_invitations" ADD COLUMN IF NOT EXISTS "expires_at" timestamp with time zone NOT NULL;
--> statement
ALTER TABLE "home_invitations" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement
ALTER TABLE "home_media" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
--> statement
ALTER TABLE "home_media" ADD COLUMN IF NOT EXISTS "home_id" uuid;
--> statement
ALTER TABLE "home_media" ADD COLUMN IF NOT EXISTS "work_id" uuid;
--> statement
ALTER TABLE "home_media" ADD COLUMN IF NOT EXISTS "room_id" uuid;
--> statement
ALTER TABLE "home_media" ADD COLUMN IF NOT EXISTS "worker_id" uuid;
--> statement
ALTER TABLE "home_media" ADD COLUMN IF NOT EXISTS "object_path" text NOT NULL;
--> statement
ALTER TABLE "home_media" ADD COLUMN IF NOT EXISTS "original_name" varchar(255) NOT NULL;
--> statement
ALTER TABLE "home_media" ADD COLUMN IF NOT EXISTS "content_type" varchar(120) NOT NULL;
--> statement
ALTER TABLE "home_media" ADD COLUMN IF NOT EXISTS "size" integer NOT NULL;
--> statement
ALTER TABLE "home_media" ADD COLUMN IF NOT EXISTS "caption" varchar(300) DEFAULT '' NOT NULL;
--> statement
ALTER TABLE "home_media" ADD COLUMN IF NOT EXISTS "phase" varchar(12) DEFAULT 'other' NOT NULL;
--> statement
ALTER TABLE "home_media" ADD COLUMN IF NOT EXISTS "uploaded_by_user_id" varchar(128) NOT NULL;
--> statement
ALTER TABLE "home_media" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp with time zone;
--> statement
ALTER TABLE "home_media" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement
ALTER TABLE "home_media" ADD COLUMN IF NOT EXISTS "taken_at" timestamp with time zone;
--> statement
ALTER TABLE "home_media" ADD COLUMN IF NOT EXISTS "taken_source" varchar(8);
--> statement
ALTER TABLE "home_media" ADD COLUMN IF NOT EXISTS "client_meta" jsonb;
--> statement
ALTER TABLE "home_media" ADD COLUMN IF NOT EXISTS "sha256" varchar(64) DEFAULT '' NOT NULL;
--> statement
ALTER TABLE "home_media" ADD COLUMN IF NOT EXISTS "invite_id" uuid;
--> statement
ALTER TABLE "home_media" ADD COLUMN IF NOT EXISTS "floor_level" integer;
--> statement
ALTER TABLE "home_media" ADD COLUMN IF NOT EXISTS "room_kind" varchar(24);
--> statement
ALTER TABLE "home_media" ADD COLUMN IF NOT EXISTS "shot_key" varchar(32);
--> statement
ALTER TABLE "home_members" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
--> statement
ALTER TABLE "home_members" ADD COLUMN IF NOT EXISTS "home_id" uuid NOT NULL;
--> statement
ALTER TABLE "home_members" ADD COLUMN IF NOT EXISTS "user_id" varchar(128) NOT NULL;
--> statement
ALTER TABLE "home_members" ADD COLUMN IF NOT EXISTS "role" varchar(16) NOT NULL;
--> statement
ALTER TABLE "home_members" ADD COLUMN IF NOT EXISTS "display_name" varchar(120) DEFAULT '' NOT NULL;
--> statement
ALTER TABLE "home_members" ADD COLUMN IF NOT EXISTS "added_by_user_id" varchar(128);
--> statement
ALTER TABLE "home_members" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement
ALTER TABLE "home_rooms" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
--> statement
ALTER TABLE "home_rooms" ADD COLUMN IF NOT EXISTS "home_id" uuid NOT NULL;
--> statement
ALTER TABLE "home_rooms" ADD COLUMN IF NOT EXISTS "name" varchar(120) NOT NULL;
--> statement
ALTER TABLE "home_rooms" ADD COLUMN IF NOT EXISTS "kind" varchar(24) DEFAULT 'other' NOT NULL;
--> statement
ALTER TABLE "home_rooms" ADD COLUMN IF NOT EXISTS "floor" varchar(20) DEFAULT '' NOT NULL;
--> statement
ALTER TABLE "home_rooms" ADD COLUMN IF NOT EXISTS "area_m2" integer;
--> statement
ALTER TABLE "home_rooms" ADD COLUMN IF NOT EXISTS "condition" varchar(16) DEFAULT 'unknown' NOT NULL;
--> statement
ALTER TABLE "home_rooms" ADD COLUMN IF NOT EXISTS "notes" text DEFAULT '' NOT NULL;
--> statement
ALTER TABLE "home_rooms" ADD COLUMN IF NOT EXISTS "position" integer DEFAULT 0 NOT NULL;
--> statement
ALTER TABLE "home_rooms" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement
ALTER TABLE "home_shares" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
--> statement
ALTER TABLE "home_shares" ADD COLUMN IF NOT EXISTS "home_id" uuid NOT NULL;
--> statement
ALTER TABLE "home_shares" ADD COLUMN IF NOT EXISTS "token_hash" varchar(64) NOT NULL;
--> statement
ALTER TABLE "home_shares" ADD COLUMN IF NOT EXISTS "label" varchar(120) DEFAULT '' NOT NULL;
--> statement
ALTER TABLE "home_shares" ADD COLUMN IF NOT EXISTS "level" varchar(12) NOT NULL;
--> statement
ALTER TABLE "home_shares" ADD COLUMN IF NOT EXISTS "scope" jsonb NOT NULL;
--> statement
ALTER TABLE "home_shares" ADD COLUMN IF NOT EXISTS "created_by_user_id" varchar(128) NOT NULL;
--> statement
ALTER TABLE "home_shares" ADD COLUMN IF NOT EXISTS "expires_at" timestamp with time zone;
--> statement
ALTER TABLE "home_shares" ADD COLUMN IF NOT EXISTS "revoked_at" timestamp with time zone;
--> statement
ALTER TABLE "home_shares" ADD COLUMN IF NOT EXISTS "last_opened_at" timestamp with time zone;
--> statement
ALTER TABLE "home_shares" ADD COLUMN IF NOT EXISTS "open_count" integer DEFAULT 0 NOT NULL;
--> statement
ALTER TABLE "home_shares" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement
ALTER TABLE "homes" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
--> statement
ALTER TABLE "homes" ADD COLUMN IF NOT EXISTS "public_id" varchar(16) NOT NULL;
--> statement
ALTER TABLE "homes" ADD COLUMN IF NOT EXISTS "created_by_user_id" varchar(128) NOT NULL;
--> statement
ALTER TABLE "homes" ADD COLUMN IF NOT EXISTS "name" varchar(160) NOT NULL;
--> statement
ALTER TABLE "homes" ADD COLUMN IF NOT EXISTS "property_type" varchar(24) NOT NULL;
--> statement
ALTER TABLE "homes" ADD COLUMN IF NOT EXISTS "city" varchar(100) DEFAULT '' NOT NULL;
--> statement
ALTER TABLE "homes" ADD COLUMN IF NOT EXISTS "district" varchar(120) DEFAULT '' NOT NULL;
--> statement
ALTER TABLE "homes" ADD COLUMN IF NOT EXISTS "address" varchar(240) DEFAULT '' NOT NULL;
--> statement
ALTER TABLE "homes" ADD COLUMN IF NOT EXISTS "area_m2" integer;
--> statement
ALTER TABLE "homes" ADD COLUMN IF NOT EXISTS "room_count" integer;
--> statement
ALTER TABLE "homes" ADD COLUMN IF NOT EXISTS "floor" varchar(20) DEFAULT '' NOT NULL;
--> statement
ALTER TABLE "homes" ADD COLUMN IF NOT EXISTS "built_year" integer;
--> statement
ALTER TABLE "homes" ADD COLUMN IF NOT EXISTS "stage" varchar(16) DEFAULT 'living' NOT NULL;
--> statement
ALTER TABLE "homes" ADD COLUMN IF NOT EXISTS "cover_media_id" uuid;
--> statement
ALTER TABLE "homes" ADD COLUMN IF NOT EXISTS "current_work_id" uuid;
--> statement
ALTER TABLE "homes" ADD COLUMN IF NOT EXISTS "notes" text DEFAULT '' NOT NULL;
--> statement
ALTER TABLE "homes" ADD COLUMN IF NOT EXISTS "public_level" varchar(12) DEFAULT 'basic' NOT NULL;
--> statement
ALTER TABLE "homes" ADD COLUMN IF NOT EXISTS "public_show_address" boolean DEFAULT false NOT NULL;
--> statement
ALTER TABLE "homes" ADD COLUMN IF NOT EXISTS "public_show_photos" boolean DEFAULT false NOT NULL;
--> statement
ALTER TABLE "homes" ADD COLUMN IF NOT EXISTS "public_show_equipment" boolean DEFAULT false NOT NULL;
--> statement
ALTER TABLE "homes" ADD COLUMN IF NOT EXISTS "show_on_worker_profiles" boolean DEFAULT true NOT NULL;
--> statement
ALTER TABLE "homes" ADD COLUMN IF NOT EXISTS "archived_at" timestamp with time zone;
--> statement
ALTER TABLE "homes" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement
ALTER TABLE "homes" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement
ALTER TABLE "infrastructure_items" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
--> statement
ALTER TABLE "infrastructure_items" ADD COLUMN IF NOT EXISTS "home_id" uuid NOT NULL;
--> statement
ALTER TABLE "infrastructure_items" ADD COLUMN IF NOT EXISTS "room_id" uuid;
--> statement
ALTER TABLE "infrastructure_items" ADD COLUMN IF NOT EXISTS "work_id" uuid;
--> statement
ALTER TABLE "infrastructure_items" ADD COLUMN IF NOT EXISTS "media_id" uuid;
--> statement
ALTER TABLE "infrastructure_items" ADD COLUMN IF NOT EXISTS "type" varchar(16) NOT NULL;
--> statement
ALTER TABLE "infrastructure_items" ADD COLUMN IF NOT EXISTS "label" varchar(160) DEFAULT '' NOT NULL;
--> statement
ALTER TABLE "infrastructure_items" ADD COLUMN IF NOT EXISTS "notes" text DEFAULT '' NOT NULL;
--> statement
ALTER TABLE "infrastructure_items" ADD COLUMN IF NOT EXISTS "points" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement
ALTER TABLE "infrastructure_items" ADD COLUMN IF NOT EXISTS "source" varchar(12) NOT NULL;
--> statement
ALTER TABLE "infrastructure_items" ADD COLUMN IF NOT EXISTS "created_by_user_id" varchar(128) NOT NULL;
--> statement
ALTER TABLE "infrastructure_items" ADD COLUMN IF NOT EXISTS "verified_by_user_id" varchar(128);
--> statement
ALTER TABLE "infrastructure_items" ADD COLUMN IF NOT EXISTS "verified_at" timestamp with time zone;
--> statement
ALTER TABLE "infrastructure_items" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement
ALTER TABLE "infrastructure_items" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement
ALTER TABLE "service_interests" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
--> statement
ALTER TABLE "service_interests" ADD COLUMN IF NOT EXISTS "user_id" varchar(128) NOT NULL;
--> statement
ALTER TABLE "service_interests" ADD COLUMN IF NOT EXISTS "kind" varchar(16) NOT NULL;
--> statement
ALTER TABLE "service_interests" ADD COLUMN IF NOT EXISTS "home_id" uuid;
--> statement
ALTER TABLE "service_interests" ADD COLUMN IF NOT EXISTS "contact" varchar(200) DEFAULT '' NOT NULL;
--> statement
ALTER TABLE "service_interests" ADD COLUMN IF NOT EXISTS "note" text DEFAULT '' NOT NULL;
--> statement
ALTER TABLE "service_interests" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement
ALTER TABLE "stage_photo_invites" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
--> statement
ALTER TABLE "stage_photo_invites" ADD COLUMN IF NOT EXISTS "home_id" uuid NOT NULL;
--> statement
ALTER TABLE "stage_photo_invites" ADD COLUMN IF NOT EXISTS "work_id" uuid;
--> statement
ALTER TABLE "stage_photo_invites" ADD COLUMN IF NOT EXISTS "token_hash" varchar(64) NOT NULL;
--> statement
ALTER TABLE "stage_photo_invites" ADD COLUMN IF NOT EXISTS "permission" varchar(16) DEFAULT 'photos' NOT NULL;
--> statement
ALTER TABLE "stage_photo_invites" ADD COLUMN IF NOT EXISTS "label" varchar(120) DEFAULT '' NOT NULL;
--> statement
ALTER TABLE "stage_photo_invites" ADD COLUMN IF NOT EXISTS "created_by_user_id" varchar(128) NOT NULL;
--> statement
ALTER TABLE "stage_photo_invites" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement
ALTER TABLE "stage_photo_invites" ADD COLUMN IF NOT EXISTS "expires_at" timestamp with time zone;
--> statement
ALTER TABLE "stage_photo_invites" ADD COLUMN IF NOT EXISTS "max_uploads" integer;
--> statement
ALTER TABLE "stage_photo_invites" ADD COLUMN IF NOT EXISTS "upload_count" integer DEFAULT 0 NOT NULL;
--> statement
ALTER TABLE "stage_photo_invites" ADD COLUMN IF NOT EXISTS "revoked_at" timestamp with time zone;
--> statement
ALTER TABLE "stage_photo_invites" ADD COLUMN IF NOT EXISTS "last_used_at" timestamp with time zone;
--> statement
ALTER TABLE "work_approvals" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
--> statement
ALTER TABLE "work_approvals" ADD COLUMN IF NOT EXISTS "work_id" uuid NOT NULL;
--> statement
ALTER TABLE "work_approvals" ADD COLUMN IF NOT EXISTS "action" varchar(20) NOT NULL;
--> statement
ALTER TABLE "work_approvals" ADD COLUMN IF NOT EXISTS "from_status" varchar(16) NOT NULL;
--> statement
ALTER TABLE "work_approvals" ADD COLUMN IF NOT EXISTS "to_status" varchar(16) NOT NULL;
--> statement
ALTER TABLE "work_approvals" ADD COLUMN IF NOT EXISTS "actor_user_id" varchar(128) NOT NULL;
--> statement
ALTER TABLE "work_approvals" ADD COLUMN IF NOT EXISTS "actor_role" varchar(16) NOT NULL;
--> statement
ALTER TABLE "work_approvals" ADD COLUMN IF NOT EXISTS "note" text DEFAULT '' NOT NULL;
--> statement
ALTER TABLE "work_approvals" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement
ALTER TABLE "work_notes" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
--> statement
ALTER TABLE "work_notes" ADD COLUMN IF NOT EXISTS "work_id" uuid NOT NULL;
--> statement
ALTER TABLE "work_notes" ADD COLUMN IF NOT EXISTS "kind" varchar(12) NOT NULL;
--> statement
ALTER TABLE "work_notes" ADD COLUMN IF NOT EXISTS "body" text NOT NULL;
--> statement
ALTER TABLE "work_notes" ADD COLUMN IF NOT EXISTS "result" varchar(8);
--> statement
ALTER TABLE "work_notes" ADD COLUMN IF NOT EXISTS "author_user_id" varchar(128) NOT NULL;
--> statement
ALTER TABLE "work_notes" ADD COLUMN IF NOT EXISTS "author_role" varchar(16) NOT NULL;
--> statement
ALTER TABLE "work_notes" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement
ALTER TABLE "work_participants" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
--> statement
ALTER TABLE "work_participants" ADD COLUMN IF NOT EXISTS "work_id" uuid NOT NULL;
--> statement
ALTER TABLE "work_participants" ADD COLUMN IF NOT EXISTS "worker_id" uuid NOT NULL;
--> statement
ALTER TABLE "work_participants" ADD COLUMN IF NOT EXISTS "role" varchar(16) DEFAULT 'lead' NOT NULL;
--> statement
ALTER TABLE "work_participants" ADD COLUMN IF NOT EXISTS "status" varchar(12) DEFAULT 'invited' NOT NULL;
--> statement
ALTER TABLE "work_participants" ADD COLUMN IF NOT EXISTS "via_team_id" uuid;
--> statement
ALTER TABLE "work_participants" ADD COLUMN IF NOT EXISTS "note" varchar(300) DEFAULT '' NOT NULL;
--> statement
ALTER TABLE "work_participants" ADD COLUMN IF NOT EXISTS "can_add_media" boolean DEFAULT true NOT NULL;
--> statement
ALTER TABLE "work_participants" ADD COLUMN IF NOT EXISTS "can_add_notes" boolean DEFAULT true NOT NULL;
--> statement
ALTER TABLE "work_participants" ADD COLUMN IF NOT EXISTS "can_edit" boolean;
--> statement
ALTER TABLE "work_participants" ADD COLUMN IF NOT EXISTS "added_by_user_id" varchar(128) NOT NULL;
--> statement
ALTER TABLE "work_participants" ADD COLUMN IF NOT EXISTS "invited_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement
ALTER TABLE "work_participants" ADD COLUMN IF NOT EXISTS "responded_at" timestamp with time zone;
--> statement
ALTER TABLE "work_participants" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement
ALTER TABLE "work_records" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
--> statement
ALTER TABLE "work_records" ADD COLUMN IF NOT EXISTS "home_id" uuid NOT NULL;
--> statement
ALTER TABLE "work_records" ADD COLUMN IF NOT EXISTS "room_id" uuid;
--> statement
ALTER TABLE "work_records" ADD COLUMN IF NOT EXISTS "equipment_id" uuid;
--> statement
ALTER TABLE "work_records" ADD COLUMN IF NOT EXISTS "title" varchar(200) NOT NULL;
--> statement
ALTER TABLE "work_records" ADD COLUMN IF NOT EXISTS "category" varchar(20) DEFAULT 'general' NOT NULL;
--> statement
ALTER TABLE "work_records" ADD COLUMN IF NOT EXISTS "kind" varchar(16) DEFAULT 'renovation' NOT NULL;
--> statement
ALTER TABLE "work_records" ADD COLUMN IF NOT EXISTS "description" text DEFAULT '' NOT NULL;
--> statement
ALTER TABLE "work_records" ADD COLUMN IF NOT EXISTS "materials" text DEFAULT '' NOT NULL;
--> statement
ALTER TABLE "work_records" ADD COLUMN IF NOT EXISTS "location" text DEFAULT '' NOT NULL;
--> statement
ALTER TABLE "work_records" ADD COLUMN IF NOT EXISTS "start_date" date;
--> statement
ALTER TABLE "work_records" ADD COLUMN IF NOT EXISTS "end_date" date;
--> statement
ALTER TABLE "work_records" ADD COLUMN IF NOT EXISTS "status" varchar(16) DEFAULT 'planned' NOT NULL;
--> statement
ALTER TABLE "work_records" ADD COLUMN IF NOT EXISTS "completed_at" timestamp with time zone;
--> statement
ALTER TABLE "work_records" ADD COLUMN IF NOT EXISTS "confirmed_at" timestamp with time zone;
--> statement
ALTER TABLE "work_records" ADD COLUMN IF NOT EXISTS "inspected_at" timestamp with time zone;
--> statement
ALTER TABLE "work_records" ADD COLUMN IF NOT EXISTS "visibility" varchar(8) DEFAULT 'public' NOT NULL;
--> statement
ALTER TABLE "work_records" ADD COLUMN IF NOT EXISTS "cost" numeric(14, 2);
--> statement
ALTER TABLE "work_records" ADD COLUMN IF NOT EXISTS "currency" varchar(3) DEFAULT 'AZN' NOT NULL;
--> statement
ALTER TABLE "work_records" ADD COLUMN IF NOT EXISTS "warranty_note" text DEFAULT '' NOT NULL;
--> statement
ALTER TABLE "work_records" ADD COLUMN IF NOT EXISTS "smeta_project_id" uuid;
--> statement
ALTER TABLE "work_records" ADD COLUMN IF NOT EXISTS "sort_order" integer;
--> statement
ALTER TABLE "work_records" ADD COLUMN IF NOT EXISTS "template_key" varchar(32);
--> statement
ALTER TABLE "work_records" ADD COLUMN IF NOT EXISTS "hidden_at" timestamp with time zone;
--> statement
ALTER TABLE "work_records" ADD COLUMN IF NOT EXISTS "created_by_user_id" varchar(128) NOT NULL;
--> statement
ALTER TABLE "work_records" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement
ALTER TABLE "work_records" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement
ALTER TABLE "worker_memberships" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
--> statement
ALTER TABLE "worker_memberships" ADD COLUMN IF NOT EXISTS "group_id" uuid NOT NULL;
--> statement
ALTER TABLE "worker_memberships" ADD COLUMN IF NOT EXISTS "member_id" uuid NOT NULL;
--> statement
ALTER TABLE "worker_memberships" ADD COLUMN IF NOT EXISTS "role" varchar(16) DEFAULT 'member' NOT NULL;
--> statement
ALTER TABLE "worker_memberships" ADD COLUMN IF NOT EXISTS "status" varchar(12) DEFAULT 'invited' NOT NULL;
--> statement
ALTER TABLE "worker_memberships" ADD COLUMN IF NOT EXISTS "invited_by_user_id" varchar(128);
--> statement
ALTER TABLE "worker_memberships" ADD COLUMN IF NOT EXISTS "joined_at" timestamp with time zone;
--> statement
ALTER TABLE "worker_memberships" ADD COLUMN IF NOT EXISTS "left_at" timestamp with time zone;
--> statement
ALTER TABLE "worker_memberships" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement
ALTER TABLE "worker_reviews" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
--> statement
ALTER TABLE "worker_reviews" ADD COLUMN IF NOT EXISTS "work_id" uuid NOT NULL;
--> statement
ALTER TABLE "worker_reviews" ADD COLUMN IF NOT EXISTS "worker_id" uuid NOT NULL;
--> statement
ALTER TABLE "worker_reviews" ADD COLUMN IF NOT EXISTS "author_user_id" varchar(128) NOT NULL;
--> statement
ALTER TABLE "worker_reviews" ADD COLUMN IF NOT EXISTS "rating" smallint NOT NULL;
--> statement
ALTER TABLE "worker_reviews" ADD COLUMN IF NOT EXISTS "body" text DEFAULT '' NOT NULL;
--> statement
ALTER TABLE "worker_reviews" ADD COLUMN IF NOT EXISTS "reported_at" timestamp with time zone;
--> statement
ALTER TABLE "worker_reviews" ADD COLUMN IF NOT EXISTS "report_reason" varchar(300);
--> statement
ALTER TABLE "worker_reviews" ADD COLUMN IF NOT EXISTS "hidden_at" timestamp with time zone;
--> statement
ALTER TABLE "worker_reviews" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement
ALTER TABLE "workers" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
--> statement
ALTER TABLE "workers" ADD COLUMN IF NOT EXISTS "kind" varchar(12) NOT NULL;
--> statement
ALTER TABLE "workers" ADD COLUMN IF NOT EXISTS "user_id" varchar(128);
--> statement
ALTER TABLE "workers" ADD COLUMN IF NOT EXISTS "manager_user_id" varchar(128);
--> statement
ALTER TABLE "workers" ADD COLUMN IF NOT EXISTS "display_name" varchar(160) NOT NULL;
--> statement
ALTER TABLE "workers" ADD COLUMN IF NOT EXISTS "specialties" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement
ALTER TABLE "workers" ADD COLUMN IF NOT EXISTS "city" varchar(100) DEFAULT '' NOT NULL;
--> statement
ALTER TABLE "workers" ADD COLUMN IF NOT EXISTS "service_area" varchar(200) DEFAULT '' NOT NULL;
--> statement
ALTER TABLE "workers" ADD COLUMN IF NOT EXISTS "about" text DEFAULT '' NOT NULL;
--> statement
ALTER TABLE "workers" ADD COLUMN IF NOT EXISTS "experience_years" integer;
--> statement
ALTER TABLE "workers" ADD COLUMN IF NOT EXISTS "photo_media_id" uuid;
--> statement
ALTER TABLE "workers" ADD COLUMN IF NOT EXISTS "phone" varchar(32) DEFAULT '' NOT NULL;
--> statement
ALTER TABLE "workers" ADD COLUMN IF NOT EXISTS "email" varchar(254) DEFAULT '' NOT NULL;
--> statement
ALTER TABLE "workers" ADD COLUMN IF NOT EXISTS "public_contact" boolean DEFAULT false NOT NULL;
--> statement
ALTER TABLE "workers" ADD COLUMN IF NOT EXISTS "legal_name" varchar(200) DEFAULT '' NOT NULL;
--> statement
ALTER TABLE "workers" ADD COLUMN IF NOT EXISTS "tax_id" varchar(20) DEFAULT '' NOT NULL;
--> statement
ALTER TABLE "workers" ADD COLUMN IF NOT EXISTS "status" varchar(16) DEFAULT 'active' NOT NULL;
--> statement
ALTER TABLE "workers" ADD COLUMN IF NOT EXISTS "merged_into_id" uuid;
--> statement
ALTER TABLE "workers" ADD COLUMN IF NOT EXISTS "created_by_user_id" varchar(128) NOT NULL;
--> statement
ALTER TABLE "workers" ADD COLUMN IF NOT EXISTS "identity_verified_at" timestamp with time zone;
--> statement
ALTER TABLE "workers" ADD COLUMN IF NOT EXISTS "identity_verified_by" varchar(128);
--> statement
ALTER TABLE "workers" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement
ALTER TABLE "workers" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement
ALTER TABLE "construction_estimates" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
--> statement
ALTER TABLE "construction_estimates" ADD COLUMN IF NOT EXISTS "owner_user_id" varchar(128) NOT NULL;
--> statement
ALTER TABLE "construction_estimates" ADD COLUMN IF NOT EXISTS "name" varchar(200) NOT NULL;
--> statement
ALTER TABLE "construction_estimates" ADD COLUMN IF NOT EXISTS "data" jsonb NOT NULL;
--> statement
ALTER TABLE "construction_estimates" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement
ALTER TABLE "construction_estimates" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement
ALTER TABLE "listing_snapshots" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
--> statement
ALTER TABLE "listing_snapshots" ADD COLUMN IF NOT EXISTS "url" text;
--> statement
ALTER TABLE "listing_snapshots" ADD COLUMN IF NOT EXISTS "url_hash" varchar(64);
--> statement
ALTER TABLE "listing_snapshots" ADD COLUMN IF NOT EXISTS "portal" varchar(16);
--> statement
ALTER TABLE "listing_snapshots" ADD COLUMN IF NOT EXISTS "source" varchar(8) NOT NULL;
--> statement
ALTER TABLE "listing_snapshots" ADD COLUMN IF NOT EXISTS "deal_type" varchar(8) DEFAULT 'sale' NOT NULL;
--> statement
ALTER TABLE "listing_snapshots" ADD COLUMN IF NOT EXISTS "city" varchar(100) DEFAULT '' NOT NULL;
--> statement
ALTER TABLE "listing_snapshots" ADD COLUMN IF NOT EXISTS "district" varchar(120) DEFAULT '' NOT NULL;
--> statement
ALTER TABLE "listing_snapshots" ADD COLUMN IF NOT EXISTS "area_m2" numeric(10, 2);
--> statement
ALTER TABLE "listing_snapshots" ADD COLUMN IF NOT EXISTS "rooms" integer;
--> statement
ALTER TABLE "listing_snapshots" ADD COLUMN IF NOT EXISTS "floor" integer;
--> statement
ALTER TABLE "listing_snapshots" ADD COLUMN IF NOT EXISTS "floors_total" integer;
--> statement
ALTER TABLE "listing_snapshots" ADD COLUMN IF NOT EXISTS "building_type" varchar(8) DEFAULT 'unknown' NOT NULL;
--> statement
ALTER TABLE "listing_snapshots" ADD COLUMN IF NOT EXISTS "renovation" varchar(8) DEFAULT 'unknown' NOT NULL;
--> statement
ALTER TABLE "listing_snapshots" ADD COLUMN IF NOT EXISTS "furnished" varchar(8) DEFAULT 'unknown' NOT NULL;
--> statement
ALTER TABLE "listing_snapshots" ADD COLUMN IF NOT EXISTS "price" numeric(14, 2);
--> statement
ALTER TABLE "listing_snapshots" ADD COLUMN IF NOT EXISTS "currency" varchar(3);
--> statement
ALTER TABLE "listing_snapshots" ADD COLUMN IF NOT EXISTS "price_azn" numeric(14, 2);
--> statement
ALTER TABLE "listing_snapshots" ADD COLUMN IF NOT EXISTS "title" varchar(300) DEFAULT '' NOT NULL;
--> statement
ALTER TABLE "listing_snapshots" ADD COLUMN IF NOT EXISTS "description" text DEFAULT '' NOT NULL;
--> statement
ALTER TABLE "listing_snapshots" ADD COLUMN IF NOT EXISTS "parsed" jsonb;
--> statement
ALTER TABLE "listing_snapshots" ADD COLUMN IF NOT EXISTS "in_pool" boolean DEFAULT false NOT NULL;
--> statement
ALTER TABLE "listing_snapshots" ADD COLUMN IF NOT EXISTS "fetched_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement
ALTER TABLE "listing_snapshots" ADD COLUMN IF NOT EXISTS "created_by_user_id" varchar(128) NOT NULL;
--> statement
ALTER TABLE "listing_snapshots" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement
ALTER TABLE "valuations" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
--> statement
ALTER TABLE "valuations" ADD COLUMN IF NOT EXISTS "owner_user_id" varchar(128) NOT NULL;
--> statement
ALTER TABLE "valuations" ADD COLUMN IF NOT EXISTS "subject_id" uuid NOT NULL;
--> statement
ALTER TABLE "valuations" ADD COLUMN IF NOT EXISTS "comp_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement
ALTER TABLE "valuations" ADD COLUMN IF NOT EXISTS "usd_rate" numeric(8, 4) NOT NULL;
--> statement
ALTER TABLE "valuations" ADD COLUMN IF NOT EXISTS "result" jsonb NOT NULL;
--> statement
ALTER TABLE "valuations" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement
ALTER TABLE "price_quotes" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
--> statement
ALTER TABLE "price_quotes" ADD COLUMN IF NOT EXISTS "item_code" varchar(80) NOT NULL;
--> statement
ALTER TABLE "price_quotes" ADD COLUMN IF NOT EXISTS "tier" varchar(10) DEFAULT 'any' NOT NULL;
--> statement
ALTER TABLE "price_quotes" ADD COLUMN IF NOT EXISTS "price" numeric(12, 2) NOT NULL;
--> statement
ALTER TABLE "price_quotes" ADD COLUMN IF NOT EXISTS "currency" varchar(3) DEFAULT 'AZN' NOT NULL;
--> statement
ALTER TABLE "price_quotes" ADD COLUMN IF NOT EXISTS "source_kind" varchar(16) NOT NULL;
--> statement
ALTER TABLE "price_quotes" ADD COLUMN IF NOT EXISTS "source_name" varchar(200) NOT NULL;
--> statement
ALTER TABLE "price_quotes" ADD COLUMN IF NOT EXISTS "source_url" text;
--> statement
ALTER TABLE "price_quotes" ADD COLUMN IF NOT EXISTS "observed_at" date NOT NULL;
--> statement
ALTER TABLE "price_quotes" ADD COLUMN IF NOT EXISTS "note" text DEFAULT '' NOT NULL;
--> statement
ALTER TABLE "price_quotes" ADD COLUMN IF NOT EXISTS "active" boolean DEFAULT true NOT NULL;
--> statement
ALTER TABLE "price_quotes" ADD COLUMN IF NOT EXISTS "created_by_user_id" varchar(128) NOT NULL;
--> statement
ALTER TABLE "price_quotes" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement
ALTER TABLE "repair_estimates" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
--> statement
ALTER TABLE "repair_estimates" ADD COLUMN IF NOT EXISTS "owner_user_id" varchar(128) NOT NULL;
--> statement
ALTER TABLE "repair_estimates" ADD COLUMN IF NOT EXISTS "name" varchar(200) NOT NULL;
--> statement
ALTER TABLE "repair_estimates" ADD COLUMN IF NOT EXISTS "data" jsonb NOT NULL;
--> statement
ALTER TABLE "repair_estimates" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement
ALTER TABLE "repair_estimates" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement
ALTER TABLE "handover_protocols" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
--> statement
ALTER TABLE "handover_protocols" ADD COLUMN IF NOT EXISTS "number" varchar(24) NOT NULL;
--> statement
ALTER TABLE "handover_protocols" ADD COLUMN IF NOT EXISTS "created_by_user_id" varchar(128) NOT NULL;
--> statement
ALTER TABLE "handover_protocols" ADD COLUMN IF NOT EXISTS "creator_role" varchar(10) NOT NULL;
--> statement
ALTER TABLE "handover_protocols" ADD COLUMN IF NOT EXISTS "kind" varchar(10) DEFAULT 'sale' NOT NULL;
--> statement
ALTER TABLE "handover_protocols" ADD COLUMN IF NOT EXISTS "rental_id" uuid;
--> statement
ALTER TABLE "handover_protocols" ADD COLUMN IF NOT EXISTS "home_id" uuid;
--> statement
ALTER TABLE "handover_protocols" ADD COLUMN IF NOT EXISTS "base_protocol_id" uuid;
--> statement
ALTER TABLE "handover_protocols" ADD COLUMN IF NOT EXISTS "base_version" integer;
--> statement
ALTER TABLE "handover_protocols" ADD COLUMN IF NOT EXISTS "baseline" jsonb;
--> statement
ALTER TABLE "handover_protocols" ADD COLUMN IF NOT EXISTS "property_type" varchar(12) DEFAULT 'apartment' NOT NULL;
--> statement
ALTER TABLE "handover_protocols" ADD COLUMN IF NOT EXISTS "address" varchar(300) NOT NULL;
--> statement
ALTER TABLE "handover_protocols" ADD COLUMN IF NOT EXISTS "handover_date" date;
--> statement
ALTER TABLE "handover_protocols" ADD COLUMN IF NOT EXISTS "handover_time" varchar(5) DEFAULT '' NOT NULL;
--> statement
ALTER TABLE "handover_protocols" ADD COLUMN IF NOT EXISTS "status" varchar(12) DEFAULT 'draft' NOT NULL;
--> statement
ALTER TABLE "handover_protocols" ADD COLUMN IF NOT EXISTS "seller_name" varchar(160) DEFAULT '' NOT NULL;
--> statement
ALTER TABLE "handover_protocols" ADD COLUMN IF NOT EXISTS "seller_phone" varchar(40) DEFAULT '' NOT NULL;
--> statement
ALTER TABLE "handover_protocols" ADD COLUMN IF NOT EXISTS "buyer_name" varchar(160) DEFAULT '' NOT NULL;
--> statement
ALTER TABLE "handover_protocols" ADD COLUMN IF NOT EXISTS "buyer_phone" varchar(40) DEFAULT '' NOT NULL;
--> statement
ALTER TABLE "handover_protocols" ADD COLUMN IF NOT EXISTS "realtor_name" varchar(160) DEFAULT '' NOT NULL;
--> statement
ALTER TABLE "handover_protocols" ADD COLUMN IF NOT EXISTS "realtor_phone" varchar(40) DEFAULT '' NOT NULL;
--> statement
ALTER TABLE "handover_protocols" ADD COLUMN IF NOT EXISTS "realtor_agency" varchar(160) DEFAULT '' NOT NULL;
--> statement
ALTER TABLE "handover_protocols" ADD COLUMN IF NOT EXISTS "extras" jsonb NOT NULL;
--> statement
ALTER TABLE "handover_protocols" ADD COLUMN IF NOT EXISTS "revision" integer DEFAULT 0 NOT NULL;
--> statement
ALTER TABLE "handover_protocols" ADD COLUMN IF NOT EXISTS "current_version" integer DEFAULT 0 NOT NULL;
--> statement
ALTER TABLE "handover_protocols" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement
ALTER TABLE "handover_protocols" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement
ALTER TABLE "handover_protocols" ADD COLUMN IF NOT EXISTS "archived_at" timestamp with time zone;
--> statement
ALTER TABLE "protocol_approvals" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
--> statement
ALTER TABLE "protocol_approvals" ADD COLUMN IF NOT EXISTS "protocol_id" uuid NOT NULL;
--> statement
ALTER TABLE "protocol_approvals" ADD COLUMN IF NOT EXISTS "version" integer NOT NULL;
--> statement
ALTER TABLE "protocol_approvals" ADD COLUMN IF NOT EXISTS "content_hash" varchar(64) NOT NULL;
--> statement
ALTER TABLE "protocol_approvals" ADD COLUMN IF NOT EXISTS "role" varchar(10) NOT NULL;
--> statement
ALTER TABLE "protocol_approvals" ADD COLUMN IF NOT EXISTS "user_id" varchar(128) NOT NULL;
--> statement
ALTER TABLE "protocol_approvals" ADD COLUMN IF NOT EXISTS "decision" varchar(10) NOT NULL;
--> statement
ALTER TABLE "protocol_approvals" ADD COLUMN IF NOT EXISTS "comment" text DEFAULT '' NOT NULL;
--> statement
ALTER TABLE "protocol_approvals" ADD COLUMN IF NOT EXISTS "auth_level" varchar(10) NOT NULL;
--> statement
ALTER TABLE "protocol_approvals" ADD COLUMN IF NOT EXISTS "auth_detail" varchar(160) DEFAULT '' NOT NULL;
--> statement
ALTER TABLE "protocol_approvals" ADD COLUMN IF NOT EXISTS "ip" varchar(64) DEFAULT '' NOT NULL;
--> statement
ALTER TABLE "protocol_approvals" ADD COLUMN IF NOT EXISTS "user_agent" varchar(300) DEFAULT '' NOT NULL;
--> statement
ALTER TABLE "protocol_approvals" ADD COLUMN IF NOT EXISTS "manifest_hash" varchar(64) DEFAULT '' NOT NULL;
--> statement
ALTER TABLE "protocol_approvals" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement
ALTER TABLE "protocol_defects" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
--> statement
ALTER TABLE "protocol_defects" ADD COLUMN IF NOT EXISTS "protocol_id" uuid NOT NULL;
--> statement
ALTER TABLE "protocol_defects" ADD COLUMN IF NOT EXISTS "room_id" uuid;
--> statement
ALTER TABLE "protocol_defects" ADD COLUMN IF NOT EXISTS "text" text NOT NULL;
--> statement
ALTER TABLE "protocol_defects" ADD COLUMN IF NOT EXISTS "created_by_user_id" varchar(128) NOT NULL;
--> statement
ALTER TABLE "protocol_defects" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement
ALTER TABLE "protocol_events" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
--> statement
ALTER TABLE "protocol_events" ADD COLUMN IF NOT EXISTS "protocol_id" uuid NOT NULL;
--> statement
ALTER TABLE "protocol_events" ADD COLUMN IF NOT EXISTS "user_id" varchar(128);
--> statement
ALTER TABLE "protocol_events" ADD COLUMN IF NOT EXISTS "action" varchar(40) NOT NULL;
--> statement
ALTER TABLE "protocol_events" ADD COLUMN IF NOT EXISTS "detail" jsonb DEFAULT '{}'::jsonb NOT NULL;
--> statement
ALTER TABLE "protocol_events" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement
ALTER TABLE "protocol_events" ADD COLUMN IF NOT EXISTS "prev_hash" varchar(64) DEFAULT '' NOT NULL;
--> statement
ALTER TABLE "protocol_events" ADD COLUMN IF NOT EXISTS "hash" varchar(64) DEFAULT '' NOT NULL;
--> statement
ALTER TABLE "protocol_invites" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
--> statement
ALTER TABLE "protocol_invites" ADD COLUMN IF NOT EXISTS "protocol_id" uuid NOT NULL;
--> statement
ALTER TABLE "protocol_invites" ADD COLUMN IF NOT EXISTS "role" varchar(10) NOT NULL;
--> statement
ALTER TABLE "protocol_invites" ADD COLUMN IF NOT EXISTS "token_hash" varchar(64) NOT NULL;
--> statement
ALTER TABLE "protocol_invites" ADD COLUMN IF NOT EXISTS "created_by_user_id" varchar(128) NOT NULL;
--> statement
ALTER TABLE "protocol_invites" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement
ALTER TABLE "protocol_invites" ADD COLUMN IF NOT EXISTS "revoked_at" timestamp with time zone;
--> statement
ALTER TABLE "protocol_invites" ADD COLUMN IF NOT EXISTS "used_by_user_id" varchar(128);
--> statement
ALTER TABLE "protocol_invites" ADD COLUMN IF NOT EXISTS "used_at" timestamp with time zone;
--> statement
ALTER TABLE "protocol_invites" ADD COLUMN IF NOT EXISTS "last_opened_at" timestamp with time zone;
--> statement
ALTER TABLE "protocol_items" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
--> statement
ALTER TABLE "protocol_items" ADD COLUMN IF NOT EXISTS "protocol_id" uuid NOT NULL;
--> statement
ALTER TABLE "protocol_items" ADD COLUMN IF NOT EXISTS "room_id" uuid NOT NULL;
--> statement
ALTER TABLE "protocol_items" ADD COLUMN IF NOT EXISTS "name" varchar(120) NOT NULL;
--> statement
ALTER TABLE "protocol_items" ADD COLUMN IF NOT EXISTS "category" varchar(10) DEFAULT 'other' NOT NULL;
--> statement
ALTER TABLE "protocol_items" ADD COLUMN IF NOT EXISTS "quantity" integer DEFAULT 1 NOT NULL;
--> statement
ALTER TABLE "protocol_items" ADD COLUMN IF NOT EXISTS "condition" varchar(10);
--> statement
ALTER TABLE "protocol_items" ADD COLUMN IF NOT EXISTS "note" text DEFAULT '' NOT NULL;
--> statement
ALTER TABLE "protocol_items" ADD COLUMN IF NOT EXISTS "change" varchar(12);
--> statement
ALTER TABLE "protocol_items" ADD COLUMN IF NOT EXISTS "prev_item_id" uuid;
--> statement
ALTER TABLE "protocol_items" ADD COLUMN IF NOT EXISTS "position" integer DEFAULT 0 NOT NULL;
--> statement
ALTER TABLE "protocol_items" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement
ALTER TABLE "protocol_media" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
--> statement
ALTER TABLE "protocol_media" ADD COLUMN IF NOT EXISTS "protocol_id" uuid NOT NULL;
--> statement
ALTER TABLE "protocol_media" ADD COLUMN IF NOT EXISTS "room_id" uuid;
--> statement
ALTER TABLE "protocol_media" ADD COLUMN IF NOT EXISTS "defect_id" uuid;
--> statement
ALTER TABLE "protocol_media" ADD COLUMN IF NOT EXISTS "target" varchar(10) DEFAULT 'room' NOT NULL;
--> statement
ALTER TABLE "protocol_media" ADD COLUMN IF NOT EXISTS "item_id" uuid;
--> statement
ALTER TABLE "protocol_media" ADD COLUMN IF NOT EXISTS "taken_at" timestamp with time zone;
--> statement
ALTER TABLE "protocol_media" ADD COLUMN IF NOT EXISTS "taken_source" varchar(8);
--> statement
ALTER TABLE "protocol_media" ADD COLUMN IF NOT EXISTS "meter_kind" varchar(10);
--> statement
ALTER TABLE "protocol_media" ADD COLUMN IF NOT EXISTS "object_path" text NOT NULL;
--> statement
ALTER TABLE "protocol_media" ADD COLUMN IF NOT EXISTS "content_type" varchar(100) NOT NULL;
--> statement
ALTER TABLE "protocol_media" ADD COLUMN IF NOT EXISTS "size" integer NOT NULL;
--> statement
ALTER TABLE "protocol_media" ADD COLUMN IF NOT EXISTS "original_name" varchar(255) DEFAULT '' NOT NULL;
--> statement
ALTER TABLE "protocol_media" ADD COLUMN IF NOT EXISTS "caption" varchar(300) DEFAULT '' NOT NULL;
--> statement
ALTER TABLE "protocol_media" ADD COLUMN IF NOT EXISTS "uploaded_by_user_id" varchar(128) NOT NULL;
--> statement
ALTER TABLE "protocol_media" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement
ALTER TABLE "protocol_media" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp with time zone;
--> statement
ALTER TABLE "protocol_media" ADD COLUMN IF NOT EXISTS "deleted_by_user_id" varchar(128);
--> statement
ALTER TABLE "protocol_media" ADD COLUMN IF NOT EXISTS "sha256" varchar(64) DEFAULT '' NOT NULL;
--> statement
ALTER TABLE "protocol_media" ADD COLUMN IF NOT EXISTS "client_meta" jsonb;
--> statement
ALTER TABLE "protocol_participants" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
--> statement
ALTER TABLE "protocol_participants" ADD COLUMN IF NOT EXISTS "protocol_id" uuid NOT NULL;
--> statement
ALTER TABLE "protocol_participants" ADD COLUMN IF NOT EXISTS "user_id" varchar(128) NOT NULL;
--> statement
ALTER TABLE "protocol_participants" ADD COLUMN IF NOT EXISTS "role" varchar(10) NOT NULL;
--> statement
ALTER TABLE "protocol_participants" ADD COLUMN IF NOT EXISTS "can_edit" boolean DEFAULT true NOT NULL;
--> statement
ALTER TABLE "protocol_participants" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement
ALTER TABLE "protocol_rooms" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
--> statement
ALTER TABLE "protocol_rooms" ADD COLUMN IF NOT EXISTS "protocol_id" uuid NOT NULL;
--> statement
ALTER TABLE "protocol_rooms" ADD COLUMN IF NOT EXISTS "name" varchar(120) NOT NULL;
--> statement
ALTER TABLE "protocol_rooms" ADD COLUMN IF NOT EXISTS "kind" varchar(12) DEFAULT 'other' NOT NULL;
--> statement
ALTER TABLE "protocol_rooms" ADD COLUMN IF NOT EXISTS "position" integer DEFAULT 0 NOT NULL;
--> statement
ALTER TABLE "protocol_rooms" ADD COLUMN IF NOT EXISTS "condition" varchar(10);
--> statement
ALTER TABLE "protocol_rooms" ADD COLUMN IF NOT EXISTS "note" text DEFAULT '' NOT NULL;
--> statement
ALTER TABLE "protocol_rooms" ADD COLUMN IF NOT EXISTS "prev_room_id" uuid;
--> statement
ALTER TABLE "protocol_rooms" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement
ALTER TABLE "protocol_versions" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
--> statement
ALTER TABLE "protocol_versions" ADD COLUMN IF NOT EXISTS "protocol_id" uuid NOT NULL;
--> statement
ALTER TABLE "protocol_versions" ADD COLUMN IF NOT EXISTS "version" integer NOT NULL;
--> statement
ALTER TABLE "protocol_versions" ADD COLUMN IF NOT EXISTS "revision" integer NOT NULL;
--> statement
ALTER TABLE "protocol_versions" ADD COLUMN IF NOT EXISTS "snapshot" jsonb NOT NULL;
--> statement
ALTER TABLE "protocol_versions" ADD COLUMN IF NOT EXISTS "content_hash" varchar(64) NOT NULL;
--> statement
ALTER TABLE "protocol_versions" ADD COLUMN IF NOT EXISTS "created_by_user_id" varchar(128) NOT NULL;
--> statement
ALTER TABLE "protocol_versions" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement
ALTER TABLE "protocol_versions" ADD COLUMN IF NOT EXISTS "pdf_object_path" text;
--> statement
ALTER TABLE "protocol_versions" ADD COLUMN IF NOT EXISTS "pdf_created_at" timestamp with time zone;
--> statement
ALTER TABLE "protocol_versions" ADD COLUMN IF NOT EXISTS "manifest" jsonb;
--> statement
ALTER TABLE "protocol_versions" ADD COLUMN IF NOT EXISTS "manifest_hash" varchar(64) DEFAULT '' NOT NULL;
--> statement
ALTER TABLE "protocol_versions" ADD COLUMN IF NOT EXISTS "verify_code" varchar(40);
--> statement
ALTER TABLE "protocol_versions" ADD COLUMN IF NOT EXISTS "final_hash" varchar(64) DEFAULT '' NOT NULL;
--> statement
ALTER TABLE "protocol_versions" ADD COLUMN IF NOT EXISTS "pdf_sha256" varchar(64) DEFAULT '' NOT NULL;
--> statement
ALTER TABLE "rental_invites" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
--> statement
ALTER TABLE "rental_invites" ADD COLUMN IF NOT EXISTS "rental_id" uuid NOT NULL;
--> statement
ALTER TABLE "rental_invites" ADD COLUMN IF NOT EXISTS "role" varchar(10) NOT NULL;
--> statement
ALTER TABLE "rental_invites" ADD COLUMN IF NOT EXISTS "can_edit" boolean DEFAULT true NOT NULL;
--> statement
ALTER TABLE "rental_invites" ADD COLUMN IF NOT EXISTS "token_hash" varchar(64) NOT NULL;
--> statement
ALTER TABLE "rental_invites" ADD COLUMN IF NOT EXISTS "created_by_user_id" varchar(128) NOT NULL;
--> statement
ALTER TABLE "rental_invites" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement
ALTER TABLE "rental_invites" ADD COLUMN IF NOT EXISTS "revoked_at" timestamp with time zone;
--> statement
ALTER TABLE "rental_invites" ADD COLUMN IF NOT EXISTS "used_by_user_id" varchar(128);
--> statement
ALTER TABLE "rental_invites" ADD COLUMN IF NOT EXISTS "used_at" timestamp with time zone;
--> statement
ALTER TABLE "rental_invites" ADD COLUMN IF NOT EXISTS "last_opened_at" timestamp with time zone;
--> statement
ALTER TABLE "rental_participants" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
--> statement
ALTER TABLE "rental_participants" ADD COLUMN IF NOT EXISTS "rental_id" uuid NOT NULL;
--> statement
ALTER TABLE "rental_participants" ADD COLUMN IF NOT EXISTS "user_id" varchar(128) NOT NULL;
--> statement
ALTER TABLE "rental_participants" ADD COLUMN IF NOT EXISTS "role" varchar(10) NOT NULL;
--> statement
ALTER TABLE "rental_participants" ADD COLUMN IF NOT EXISTS "can_edit" boolean DEFAULT true NOT NULL;
--> statement
ALTER TABLE "rental_participants" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement
ALTER TABLE "rentals" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
--> statement
ALTER TABLE "rentals" ADD COLUMN IF NOT EXISTS "number" varchar(24) NOT NULL;
--> statement
ALTER TABLE "rentals" ADD COLUMN IF NOT EXISTS "created_by_user_id" varchar(128) NOT NULL;
--> statement
ALTER TABLE "rentals" ADD COLUMN IF NOT EXISTS "address" varchar(300) NOT NULL;
--> statement
ALTER TABLE "rentals" ADD COLUMN IF NOT EXISTS "property_type" varchar(12) DEFAULT 'apartment' NOT NULL;
--> statement
ALTER TABLE "rentals" ADD COLUMN IF NOT EXISTS "landlord_name" varchar(160) DEFAULT '' NOT NULL;
--> statement
ALTER TABLE "rentals" ADD COLUMN IF NOT EXISTS "landlord_phone" varchar(40) DEFAULT '' NOT NULL;
--> statement
ALTER TABLE "rentals" ADD COLUMN IF NOT EXISTS "tenant_name" varchar(160) DEFAULT '' NOT NULL;
--> statement
ALTER TABLE "rentals" ADD COLUMN IF NOT EXISTS "tenant_phone" varchar(40) DEFAULT '' NOT NULL;
--> statement
ALTER TABLE "rentals" ADD COLUMN IF NOT EXISTS "realtor_name" varchar(160) DEFAULT '' NOT NULL;
--> statement
ALTER TABLE "rentals" ADD COLUMN IF NOT EXISTS "realtor_phone" varchar(40) DEFAULT '' NOT NULL;
--> statement
ALTER TABLE "rentals" ADD COLUMN IF NOT EXISTS "start_date" date;
--> statement
ALTER TABLE "rentals" ADD COLUMN IF NOT EXISTS "end_date" date;
--> statement
ALTER TABLE "rentals" ADD COLUMN IF NOT EXISTS "monthly_rent" integer;
--> statement
ALTER TABLE "rentals" ADD COLUMN IF NOT EXISTS "deposit" integer;
--> statement
ALTER TABLE "rentals" ADD COLUMN IF NOT EXISTS "currency" varchar(3) DEFAULT 'AZN' NOT NULL;
--> statement
ALTER TABLE "rentals" ADD COLUMN IF NOT EXISTS "notes" text DEFAULT '' NOT NULL;
--> statement
ALTER TABLE "rentals" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement
ALTER TABLE "rentals" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement
ALTER TABLE "rentals" ADD COLUMN IF NOT EXISTS "archived_at" timestamp with time zone;
--> statement
ALTER TABLE "finance_budget_versions" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
--> statement
ALTER TABLE "finance_budget_versions" ADD COLUMN IF NOT EXISTS "project_id" uuid NOT NULL;
--> statement
ALTER TABLE "finance_budget_versions" ADD COLUMN IF NOT EXISTS "version" integer NOT NULL;
--> statement
ALTER TABLE "finance_budget_versions" ADD COLUMN IF NOT EXISTS "total" numeric(14, 2) NOT NULL;
--> statement
ALTER TABLE "finance_budget_versions" ADD COLUMN IF NOT EXISTS "reason" varchar(16) NOT NULL;
--> statement
ALTER TABLE "finance_budget_versions" ADD COLUMN IF NOT EXISTS "note" text DEFAULT '' NOT NULL;
--> statement
ALTER TABLE "finance_budget_versions" ADD COLUMN IF NOT EXISTS "change_order_id" uuid;
--> statement
ALTER TABLE "finance_budget_versions" ADD COLUMN IF NOT EXISTS "created_by_user_id" varchar(128) NOT NULL;
--> statement
ALTER TABLE "finance_budget_versions" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement
ALTER TABLE "finance_change_orders" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
--> statement
ALTER TABLE "finance_change_orders" ADD COLUMN IF NOT EXISTS "project_id" uuid NOT NULL;
--> statement
ALTER TABLE "finance_change_orders" ADD COLUMN IF NOT EXISTS "number" integer NOT NULL;
--> statement
ALTER TABLE "finance_change_orders" ADD COLUMN IF NOT EXISTS "party_id" uuid;
--> statement
ALTER TABLE "finance_change_orders" ADD COLUMN IF NOT EXISTS "title" varchar(200) NOT NULL;
--> statement
ALTER TABLE "finance_change_orders" ADD COLUMN IF NOT EXISTS "description" text DEFAULT '' NOT NULL;
--> statement
ALTER TABLE "finance_change_orders" ADD COLUMN IF NOT EXISTS "reason" text DEFAULT '' NOT NULL;
--> statement
ALTER TABLE "finance_change_orders" ADD COLUMN IF NOT EXISTS "amount" numeric(14, 2) NOT NULL;
--> statement
ALTER TABLE "finance_change_orders" ADD COLUMN IF NOT EXISTS "date" date NOT NULL;
--> statement
ALTER TABLE "finance_change_orders" ADD COLUMN IF NOT EXISTS "media_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement
ALTER TABLE "finance_change_orders" ADD COLUMN IF NOT EXISTS "status" varchar(16) DEFAULT 'proposed' NOT NULL;
--> statement
ALTER TABLE "finance_change_orders" ADD COLUMN IF NOT EXISTS "proposed_by_user_id" varchar(128) NOT NULL;
--> statement
ALTER TABLE "finance_change_orders" ADD COLUMN IF NOT EXISTS "decided_by_user_id" varchar(128);
--> statement
ALTER TABLE "finance_change_orders" ADD COLUMN IF NOT EXISTS "decided_at" timestamp with time zone;
--> statement
ALTER TABLE "finance_change_orders" ADD COLUMN IF NOT EXISTS "decision_note" text DEFAULT '' NOT NULL;
--> statement
ALTER TABLE "finance_change_orders" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement
ALTER TABLE "finance_expense_items" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
--> statement
ALTER TABLE "finance_expense_items" ADD COLUMN IF NOT EXISTS "expense_id" uuid NOT NULL;
--> statement
ALTER TABLE "finance_expense_items" ADD COLUMN IF NOT EXISTS "position" integer DEFAULT 0 NOT NULL;
--> statement
ALTER TABLE "finance_expense_items" ADD COLUMN IF NOT EXISTS "name" varchar(200) NOT NULL;
--> statement
ALTER TABLE "finance_expense_items" ADD COLUMN IF NOT EXISTS "quantity" numeric(14, 3);
--> statement
ALTER TABLE "finance_expense_items" ADD COLUMN IF NOT EXISTS "unit" varchar(16) DEFAULT '' NOT NULL;
--> statement
ALTER TABLE "finance_expense_items" ADD COLUMN IF NOT EXISTS "unit_price" numeric(14, 2);
--> statement
ALTER TABLE "finance_expense_items" ADD COLUMN IF NOT EXISTS "line_total" numeric(14, 2) NOT NULL;
--> statement
ALTER TABLE "finance_expense_items" ADD COLUMN IF NOT EXISTS "category" varchar(24);
--> statement
ALTER TABLE "finance_expense_items" ADD COLUMN IF NOT EXISTS "kind" varchar(8);
--> statement
ALTER TABLE "finance_expense_items" ADD COLUMN IF NOT EXISTS "note" text DEFAULT '' NOT NULL;
--> statement
ALTER TABLE "finance_expenses" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
--> statement
ALTER TABLE "finance_expenses" ADD COLUMN IF NOT EXISTS "project_id" uuid NOT NULL;
--> statement
ALTER TABLE "finance_expenses" ADD COLUMN IF NOT EXISTS "home_id" uuid NOT NULL;
--> statement
ALTER TABLE "finance_expenses" ADD COLUMN IF NOT EXISTS "date" date NOT NULL;
--> statement
ALTER TABLE "finance_expenses" ADD COLUMN IF NOT EXISTS "category" varchar(24) NOT NULL;
--> statement
ALTER TABLE "finance_expenses" ADD COLUMN IF NOT EXISTS "description" varchar(300) NOT NULL;
--> statement
ALTER TABLE "finance_expenses" ADD COLUMN IF NOT EXISTS "party_id" uuid;
--> statement
ALTER TABLE "finance_expenses" ADD COLUMN IF NOT EXISTS "vendor_name" varchar(200) DEFAULT '' NOT NULL;
--> statement
ALTER TABLE "finance_expenses" ADD COLUMN IF NOT EXISTS "room_id" uuid;
--> statement
ALTER TABLE "finance_expenses" ADD COLUMN IF NOT EXISTS "subtotal" numeric(14, 2) NOT NULL;
--> statement
ALTER TABLE "finance_expenses" ADD COLUMN IF NOT EXISTS "discount" numeric(14, 2) DEFAULT '0' NOT NULL;
--> statement
ALTER TABLE "finance_expenses" ADD COLUMN IF NOT EXISTS "tax" numeric(14, 2) DEFAULT '0' NOT NULL;
--> statement
ALTER TABLE "finance_expenses" ADD COLUMN IF NOT EXISTS "total" numeric(14, 2) NOT NULL;
--> statement
ALTER TABLE "finance_expenses" ADD COLUMN IF NOT EXISTS "payment_method" varchar(12) DEFAULT '' NOT NULL;
--> statement
ALTER TABLE "finance_expenses" ADD COLUMN IF NOT EXISTS "funded_by_party_id" uuid;
--> statement
ALTER TABLE "finance_expenses" ADD COLUMN IF NOT EXISTS "invoice_id" uuid;
--> statement
ALTER TABLE "finance_expenses" ADD COLUMN IF NOT EXISTS "entry_id" uuid;
--> statement
ALTER TABLE "finance_expenses" ADD COLUMN IF NOT EXISTS "work_id" uuid;
--> statement
ALTER TABLE "finance_expenses" ADD COLUMN IF NOT EXISTS "note" text DEFAULT '' NOT NULL;
--> statement
ALTER TABLE "finance_expenses" ADD COLUMN IF NOT EXISTS "status" varchar(10) DEFAULT 'pending' NOT NULL;
--> statement
ALTER TABLE "finance_expenses" ADD COLUMN IF NOT EXISTS "approved_by_user_id" varchar(128);
--> statement
ALTER TABLE "finance_expenses" ADD COLUMN IF NOT EXISTS "approved_at" timestamp with time zone;
--> statement
ALTER TABLE "finance_expenses" ADD COLUMN IF NOT EXISTS "void_reason" text;
--> statement
ALTER TABLE "finance_expenses" ADD COLUMN IF NOT EXISTS "idempotency_key" varchar(64);
--> statement
ALTER TABLE "finance_expenses" ADD COLUMN IF NOT EXISTS "created_by_user_id" varchar(128) NOT NULL;
--> statement
ALTER TABLE "finance_expenses" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement
ALTER TABLE "finance_expenses" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement
ALTER TABLE "finance_invoices" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
--> statement
ALTER TABLE "finance_invoices" ADD COLUMN IF NOT EXISTS "project_id" uuid NOT NULL;
--> statement
ALTER TABLE "finance_invoices" ADD COLUMN IF NOT EXISTS "home_id" uuid NOT NULL;
--> statement
ALTER TABLE "finance_invoices" ADD COLUMN IF NOT EXISTS "media_id" uuid NOT NULL;
--> statement
ALTER TABLE "finance_invoices" ADD COLUMN IF NOT EXISTS "sha256" varchar(64) DEFAULT '' NOT NULL;
--> statement
ALTER TABLE "finance_invoices" ADD COLUMN IF NOT EXISTS "status" varchar(12) DEFAULT 'uploaded' NOT NULL;
--> statement
ALTER TABLE "finance_invoices" ADD COLUMN IF NOT EXISTS "ai_result" jsonb;
--> statement
ALTER TABLE "finance_invoices" ADD COLUMN IF NOT EXISTS "ai_model" varchar(64);
--> statement
ALTER TABLE "finance_invoices" ADD COLUMN IF NOT EXISTS "ai_error" text;
--> statement
ALTER TABLE "finance_invoices" ADD COLUMN IF NOT EXISTS "confirmed" jsonb;
--> statement
ALTER TABLE "finance_invoices" ADD COLUMN IF NOT EXISTS "doc_number" varchar(80) DEFAULT '' NOT NULL;
--> statement
ALTER TABLE "finance_invoices" ADD COLUMN IF NOT EXISTS "vendor" varchar(200) DEFAULT '' NOT NULL;
--> statement
ALTER TABLE "finance_invoices" ADD COLUMN IF NOT EXISTS "doc_date" date;
--> statement
ALTER TABLE "finance_invoices" ADD COLUMN IF NOT EXISTS "total" numeric(14, 2);
--> statement
ALTER TABLE "finance_invoices" ADD COLUMN IF NOT EXISTS "duplicate_of_id" uuid;
--> statement
ALTER TABLE "finance_invoices" ADD COLUMN IF NOT EXISTS "expense_id" uuid;
--> statement
ALTER TABLE "finance_invoices" ADD COLUMN IF NOT EXISTS "uploaded_by_user_id" varchar(128) NOT NULL;
--> statement
ALTER TABLE "finance_invoices" ADD COLUMN IF NOT EXISTS "confirmed_by_user_id" varchar(128);
--> statement
ALTER TABLE "finance_invoices" ADD COLUMN IF NOT EXISTS "confirmed_at" timestamp with time zone;
--> statement
ALTER TABLE "finance_invoices" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement
ALTER TABLE "finance_parties" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
--> statement
ALTER TABLE "finance_parties" ADD COLUMN IF NOT EXISTS "project_id" uuid NOT NULL;
--> statement
ALTER TABLE "finance_parties" ADD COLUMN IF NOT EXISTS "home_id" uuid NOT NULL;
--> statement
ALTER TABLE "finance_parties" ADD COLUMN IF NOT EXISTS "name" varchar(160) NOT NULL;
--> statement
ALTER TABLE "finance_parties" ADD COLUMN IF NOT EXISTS "role" varchar(12) NOT NULL;
--> statement
ALTER TABLE "finance_parties" ADD COLUMN IF NOT EXISTS "phone" varchar(32) DEFAULT '' NOT NULL;
--> statement
ALTER TABLE "finance_parties" ADD COLUMN IF NOT EXISTS "note" text DEFAULT '' NOT NULL;
--> statement
ALTER TABLE "finance_parties" ADD COLUMN IF NOT EXISTS "contract_amount" numeric(14, 2);
--> statement
ALTER TABLE "finance_parties" ADD COLUMN IF NOT EXISTS "contract_note" text DEFAULT '' NOT NULL;
--> statement
ALTER TABLE "finance_parties" ADD COLUMN IF NOT EXISTS "worker_id" uuid;
--> statement
ALTER TABLE "finance_parties" ADD COLUMN IF NOT EXISTS "user_id" varchar(128);
--> statement
ALTER TABLE "finance_parties" ADD COLUMN IF NOT EXISTS "invite_token_hash" varchar(64);
--> statement
ALTER TABLE "finance_parties" ADD COLUMN IF NOT EXISTS "invite_expires_at" timestamp with time zone;
--> statement
ALTER TABLE "finance_parties" ADD COLUMN IF NOT EXISTS "archived_at" timestamp with time zone;
--> statement
ALTER TABLE "finance_parties" ADD COLUMN IF NOT EXISTS "created_by_user_id" varchar(128) NOT NULL;
--> statement
ALTER TABLE "finance_parties" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement
ALTER TABLE "finance_parties" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement
ALTER TABLE "finance_payments" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
--> statement
ALTER TABLE "finance_payments" ADD COLUMN IF NOT EXISTS "project_id" uuid NOT NULL;
--> statement
ALTER TABLE "finance_payments" ADD COLUMN IF NOT EXISTS "home_id" uuid NOT NULL;
--> statement
ALTER TABLE "finance_payments" ADD COLUMN IF NOT EXISTS "kind" varchar(8) NOT NULL;
--> statement
ALTER TABLE "finance_payments" ADD COLUMN IF NOT EXISTS "date" date NOT NULL;
--> statement
ALTER TABLE "finance_payments" ADD COLUMN IF NOT EXISTS "amount" numeric(14, 2) NOT NULL;
--> statement
ALTER TABLE "finance_payments" ADD COLUMN IF NOT EXISTS "party_id" uuid;
--> statement
ALTER TABLE "finance_payments" ADD COLUMN IF NOT EXISTS "payee_name" varchar(200) DEFAULT '' NOT NULL;
--> statement
ALTER TABLE "finance_payments" ADD COLUMN IF NOT EXISTS "payer_name" varchar(200) DEFAULT '' NOT NULL;
--> statement
ALTER TABLE "finance_payments" ADD COLUMN IF NOT EXISTS "purpose" varchar(300) DEFAULT '' NOT NULL;
--> statement
ALTER TABLE "finance_payments" ADD COLUMN IF NOT EXISTS "method" varchar(12) DEFAULT '' NOT NULL;
--> statement
ALTER TABLE "finance_payments" ADD COLUMN IF NOT EXISTS "expense_id" uuid;
--> statement
ALTER TABLE "finance_payments" ADD COLUMN IF NOT EXISTS "change_order_id" uuid;
--> statement
ALTER TABLE "finance_payments" ADD COLUMN IF NOT EXISTS "proof_media_id" uuid;
--> statement
ALTER TABLE "finance_payments" ADD COLUMN IF NOT EXISTS "status" varchar(10) DEFAULT 'recorded' NOT NULL;
--> statement
ALTER TABLE "finance_payments" ADD COLUMN IF NOT EXISTS "confirmed_by_user_id" varchar(128);
--> statement
ALTER TABLE "finance_payments" ADD COLUMN IF NOT EXISTS "confirmed_at" timestamp with time zone;
--> statement
ALTER TABLE "finance_payments" ADD COLUMN IF NOT EXISTS "cancel_reason" text;
--> statement
ALTER TABLE "finance_payments" ADD COLUMN IF NOT EXISTS "idempotency_key" varchar(64);
--> statement
ALTER TABLE "finance_payments" ADD COLUMN IF NOT EXISTS "created_by_user_id" varchar(128) NOT NULL;
--> statement
ALTER TABLE "finance_payments" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement
ALTER TABLE "finance_payments" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement
ALTER TABLE "home_projects" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
--> statement
ALTER TABLE "home_projects" ADD COLUMN IF NOT EXISTS "home_id" uuid NOT NULL;
--> statement
ALTER TABLE "home_projects" ADD COLUMN IF NOT EXISTS "name" varchar(160) NOT NULL;
--> statement
ALTER TABLE "home_projects" ADD COLUMN IF NOT EXISTS "kind" varchar(16) DEFAULT 'construction' NOT NULL;
--> statement
ALTER TABLE "home_projects" ADD COLUMN IF NOT EXISTS "start_date" date;
--> statement
ALTER TABLE "home_projects" ADD COLUMN IF NOT EXISTS "end_date" date;
--> statement
ALTER TABLE "home_projects" ADD COLUMN IF NOT EXISTS "status" varchar(10) DEFAULT 'active' NOT NULL;
--> statement
ALTER TABLE "home_projects" ADD COLUMN IF NOT EXISTS "currency" varchar(3) DEFAULT 'AZN' NOT NULL;
--> statement
ALTER TABLE "home_projects" ADD COLUMN IF NOT EXISTS "smeta_project_id" uuid;
--> statement
ALTER TABLE "home_projects" ADD COLUMN IF NOT EXISTS "created_by_user_id" varchar(128) NOT NULL;
--> statement
ALTER TABLE "home_projects" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement
ALTER TABLE "home_projects" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement
ALTER TABLE "media_stage_tags" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
--> statement
ALTER TABLE "media_stage_tags" ADD COLUMN IF NOT EXISTS "media_id" uuid NOT NULL;
--> statement
ALTER TABLE "media_stage_tags" ADD COLUMN IF NOT EXISTS "home_id" uuid NOT NULL;
--> statement
ALTER TABLE "media_stage_tags" ADD COLUMN IF NOT EXISTS "ai_status" varchar(12) DEFAULT 'queued' NOT NULL;
--> statement
ALTER TABLE "media_stage_tags" ADD COLUMN IF NOT EXISTS "ai_stage" varchar(24);
--> statement
ALTER TABLE "media_stage_tags" ADD COLUMN IF NOT EXISTS "ai_confidence" numeric(4, 3);
--> statement
ALTER TABLE "media_stage_tags" ADD COLUMN IF NOT EXISTS "ai_room_kind" varchar(24);
--> statement
ALTER TABLE "media_stage_tags" ADD COLUMN IF NOT EXISTS "ai_utility" varchar(16);
--> statement
ALTER TABLE "media_stage_tags" ADD COLUMN IF NOT EXISTS "ai_utilities" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement
ALTER TABLE "media_stage_tags" ADD COLUMN IF NOT EXISTS "ai_work_type" varchar(24);
--> statement
ALTER TABLE "media_stage_tags" ADD COLUMN IF NOT EXISTS "ai_evidence" text;
--> statement
ALTER TABLE "media_stage_tags" ADD COLUMN IF NOT EXISTS "ai_model" varchar(64);
--> statement
ALTER TABLE "media_stage_tags" ADD COLUMN IF NOT EXISTS "ai_error" text;
--> statement
ALTER TABLE "media_stage_tags" ADD COLUMN IF NOT EXISTS "analyzed_sha256" varchar(64);
--> statement
ALTER TABLE "media_stage_tags" ADD COLUMN IF NOT EXISTS "attempts" integer DEFAULT 0 NOT NULL;
--> statement
ALTER TABLE "media_stage_tags" ADD COLUMN IF NOT EXISTS "claimed_at" timestamp with time zone;
--> statement
ALTER TABLE "media_stage_tags" ADD COLUMN IF NOT EXISTS "analyzed_at" timestamp with time zone;
--> statement
ALTER TABLE "media_stage_tags" ADD COLUMN IF NOT EXISTS "stage" varchar(24);
--> statement
ALTER TABLE "media_stage_tags" ADD COLUMN IF NOT EXISTS "stage_status" varchar(14) DEFAULT 'ai_suggested' NOT NULL;
--> statement
ALTER TABLE "media_stage_tags" ADD COLUMN IF NOT EXISTS "room_kind" varchar(24);
--> statement
ALTER TABLE "media_stage_tags" ADD COLUMN IF NOT EXISTS "utility" varchar(16);
--> statement
ALTER TABLE "media_stage_tags" ADD COLUMN IF NOT EXISTS "decided_by_user_id" varchar(128);
--> statement
ALTER TABLE "media_stage_tags" ADD COLUMN IF NOT EXISTS "decided_at" timestamp with time zone;
--> statement
ALTER TABLE "media_stage_tags" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement
ALTER TABLE "media_stage_tags" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement
ALTER TABLE "ai_estimate_files" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
--> statement
ALTER TABLE "ai_estimate_files" ADD COLUMN IF NOT EXISTS "estimate_id" uuid NOT NULL;
--> statement
ALTER TABLE "ai_estimate_files" ADD COLUMN IF NOT EXISTS "object_path" text NOT NULL;
--> statement
ALTER TABLE "ai_estimate_files" ADD COLUMN IF NOT EXISTS "original_name" varchar(255) NOT NULL;
--> statement
ALTER TABLE "ai_estimate_files" ADD COLUMN IF NOT EXISTS "content_type" varchar(120) NOT NULL;
--> statement
ALTER TABLE "ai_estimate_files" ADD COLUMN IF NOT EXISTS "size" integer NOT NULL;
--> statement
ALTER TABLE "ai_estimate_files" ADD COLUMN IF NOT EXISTS "sha256" varchar(64) DEFAULT '' NOT NULL;
--> statement
ALTER TABLE "ai_estimate_files" ADD COLUMN IF NOT EXISTS "kind" varchar(10) NOT NULL;
--> statement
ALTER TABLE "ai_estimate_files" ADD COLUMN IF NOT EXISTS "status" varchar(10) DEFAULT 'uploaded' NOT NULL;
--> statement
ALTER TABLE "ai_estimate_files" ADD COLUMN IF NOT EXISTS "error" text;
--> statement
ALTER TABLE "ai_estimate_files" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement
ALTER TABLE "ai_estimate_versions" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
--> statement
ALTER TABLE "ai_estimate_versions" ADD COLUMN IF NOT EXISTS "estimate_id" uuid NOT NULL;
--> statement
ALTER TABLE "ai_estimate_versions" ADD COLUMN IF NOT EXISTS "version" integer NOT NULL;
--> statement
ALTER TABLE "ai_estimate_versions" ADD COLUMN IF NOT EXISTS "reason" varchar(12) NOT NULL;
--> statement
ALTER TABLE "ai_estimate_versions" ADD COLUMN IF NOT EXISTS "doc" jsonb NOT NULL;
--> statement
ALTER TABLE "ai_estimate_versions" ADD COLUMN IF NOT EXISTS "totals" jsonb NOT NULL;
--> statement
ALTER TABLE "ai_estimate_versions" ADD COLUMN IF NOT EXISTS "created_by_user_id" varchar(128) NOT NULL;
--> statement
ALTER TABLE "ai_estimate_versions" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement
ALTER TABLE "ai_estimates" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
--> statement
ALTER TABLE "ai_estimates" ADD COLUMN IF NOT EXISTS "owner_user_id" varchar(128) NOT NULL;
--> statement
ALTER TABLE "ai_estimates" ADD COLUMN IF NOT EXISTS "home_id" uuid;
--> statement
ALTER TABLE "ai_estimates" ADD COLUMN IF NOT EXISTS "name" varchar(200) NOT NULL;
--> statement
ALTER TABLE "ai_estimates" ADD COLUMN IF NOT EXISTS "kind" varchar(16) NOT NULL;
--> statement
ALTER TABLE "ai_estimates" ADD COLUMN IF NOT EXISTS "location" varchar(200) DEFAULT '' NOT NULL;
--> statement
ALTER TABLE "ai_estimates" ADD COLUMN IF NOT EXISTS "area_m2" integer;
--> statement
ALTER TABLE "ai_estimates" ADD COLUMN IF NOT EXISTS "floors" integer;
--> statement
ALTER TABLE "ai_estimates" ADD COLUMN IF NOT EXISTS "status" varchar(12) DEFAULT 'draft' NOT NULL;
--> statement
ALTER TABLE "ai_estimates" ADD COLUMN IF NOT EXISTS "ai_error" text;
--> statement
ALTER TABLE "ai_estimates" ADD COLUMN IF NOT EXISTS "ai_model" varchar(64);
--> statement
ALTER TABLE "ai_estimates" ADD COLUMN IF NOT EXISTS "doc" jsonb NOT NULL;
--> statement
ALTER TABLE "ai_estimates" ADD COLUMN IF NOT EXISTS "answers" jsonb DEFAULT '{}'::jsonb NOT NULL;
--> statement
ALTER TABLE "ai_estimates" ADD COLUMN IF NOT EXISTS "ai_result" jsonb;
--> statement
ALTER TABLE "ai_estimates" ADD COLUMN IF NOT EXISTS "contractor" jsonb;
--> statement
ALTER TABLE "ai_estimates" ADD COLUMN IF NOT EXISTS "version" integer DEFAULT 0 NOT NULL;
--> statement
ALTER TABLE "ai_estimates" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement
ALTER TABLE "ai_estimates" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement
DO $$ BEGIN
  ALTER TABLE "change_orders" ADD CONSTRAINT "change_orders_project_id_renovation_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."renovation_projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement
DO $$ BEGIN
  ALTER TABLE "change_orders" ADD CONSTRAINT "change_orders_room_id_renovation_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."renovation_rooms"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement
DO $$ BEGIN
  ALTER TABLE "renovation_milestones" ADD CONSTRAINT "renovation_milestones_project_id_renovation_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."renovation_projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement
DO $$ BEGIN
  ALTER TABLE "passport_shares" ADD CONSTRAINT "passport_shares_project_id_renovation_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."renovation_projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement
DO $$ BEGIN
  ALTER TABLE "project_media" ADD CONSTRAINT "project_media_project_id_renovation_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."renovation_projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement
DO $$ BEGIN
  ALTER TABLE "project_participants" ADD CONSTRAINT "project_participants_project_id_renovation_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."renovation_projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement
DO $$ BEGIN
  ALTER TABLE "project_payments" ADD CONSTRAINT "project_payments_project_id_renovation_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."renovation_projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement
DO $$ BEGIN
  ALTER TABLE "renovation_rooms" ADD CONSTRAINT "renovation_rooms_project_id_renovation_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."renovation_projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement
DO $$ BEGIN
  ALTER TABLE "revision_requests" ADD CONSTRAINT "revision_requests_project_id_renovation_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."renovation_projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement
DO $$ BEGIN
  ALTER TABLE "revision_requests" ADD CONSTRAINT "revision_requests_milestone_id_renovation_milestones_id_fk" FOREIGN KEY ("milestone_id") REFERENCES "public"."renovation_milestones"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement
DO $$ BEGIN
  ALTER TABLE "scope_items" ADD CONSTRAINT "scope_items_project_id_renovation_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."renovation_projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement
DO $$ BEGIN
  ALTER TABLE "scope_items" ADD CONSTRAINT "scope_items_room_id_renovation_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."renovation_rooms"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement
DO $$ BEGIN
  ALTER TABLE "renovation_timeline_events" ADD CONSTRAINT "renovation_timeline_events_project_id_renovation_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."renovation_projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement
DO $$ BEGIN
  ALTER TABLE "smeta_change_orders" ADD CONSTRAINT "smeta_change_orders_project_id_smeta_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."smeta_projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement
DO $$ BEGIN
  ALTER TABLE "smeta_client_approvals" ADD CONSTRAINT "smeta_client_approvals_project_id_smeta_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."smeta_projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement
DO $$ BEGIN
  ALTER TABLE "smeta_estimate_versions" ADD CONSTRAINT "smeta_estimate_versions_project_id_smeta_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."smeta_projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement
DO $$ BEGIN
  ALTER TABLE "smeta_expenses" ADD CONSTRAINT "smeta_expenses_project_id_smeta_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."smeta_projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement
DO $$ BEGIN
  ALTER TABLE "smeta_line_items" ADD CONSTRAINT "smeta_line_items_project_id_smeta_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."smeta_projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement
DO $$ BEGIN
  ALTER TABLE "smeta_line_items" ADD CONSTRAINT "smeta_line_items_project_id_section_id_smeta_estimate_sections_project_id_id_fk" FOREIGN KEY ("project_id","section_id") REFERENCES "public"."smeta_estimate_sections"("project_id","id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement
DO $$ BEGIN
  ALTER TABLE "smeta_measurements" ADD CONSTRAINT "smeta_measurements_project_id_smeta_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."smeta_projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement
DO $$ BEGIN
  ALTER TABLE "smeta_payment_milestones" ADD CONSTRAINT "smeta_payment_milestones_project_id_smeta_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."smeta_projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement
DO $$ BEGIN
  ALTER TABLE "smeta_photos" ADD CONSTRAINT "smeta_photos_project_id_smeta_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."smeta_projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement
DO $$ BEGIN
  ALTER TABLE "smeta_project_costs" ADD CONSTRAINT "smeta_project_costs_project_id_smeta_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."smeta_projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement
DO $$ BEGIN
  ALTER TABLE "smeta_receipts" ADD CONSTRAINT "smeta_receipts_project_id_smeta_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."smeta_projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement
DO $$ BEGIN
  ALTER TABLE "smeta_revision_requests" ADD CONSTRAINT "smeta_revision_requests_project_id_smeta_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."smeta_projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement
DO $$ BEGIN
  ALTER TABLE "smeta_estimate_sections" ADD CONSTRAINT "smeta_estimate_sections_project_id_smeta_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."smeta_projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement
DO $$ BEGIN
  ALTER TABLE "smeta_shares" ADD CONSTRAINT "smeta_shares_project_id_smeta_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."smeta_projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement
DO $$ BEGIN
  ALTER TABLE "passport_works" ADD CONSTRAINT "passport_works_passport_id_property_passports_id_fk" FOREIGN KEY ("passport_id") REFERENCES "public"."property_passports"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement
DO $$ BEGIN
  ALTER TABLE "property_passports" ADD CONSTRAINT "property_passports_listing_id_realtor_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."realtor_listings"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement
DO $$ BEGIN
  ALTER TABLE "realtor_appointments" ADD CONSTRAINT "realtor_appointments_lead_id_realtor_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."realtor_leads"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement
DO $$ BEGIN
  ALTER TABLE "realtor_appointments" ADD CONSTRAINT "realtor_appointments_listing_id_realtor_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."realtor_listings"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement
DO $$ BEGIN
  ALTER TABLE "realtor_appointments" ADD CONSTRAINT "realtor_appointments_agent_id_realtor_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."realtor_agents"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement
DO $$ BEGIN
  ALTER TABLE "realtor_events" ADD CONSTRAINT "realtor_events_passport_id_property_passports_id_fk" FOREIGN KEY ("passport_id") REFERENCES "public"."property_passports"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement
DO $$ BEGIN
  ALTER TABLE "realtor_events" ADD CONSTRAINT "realtor_events_listing_id_realtor_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."realtor_listings"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement
DO $$ BEGIN
  ALTER TABLE "realtor_leads" ADD CONSTRAINT "realtor_leads_agent_id_realtor_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."realtor_agents"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement
DO $$ BEGIN
  ALTER TABLE "realtor_leads" ADD CONSTRAINT "realtor_leads_listing_id_realtor_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."realtor_listings"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement
DO $$ BEGIN
  ALTER TABLE "realtor_listings" ADD CONSTRAINT "realtor_listings_agent_id_realtor_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."realtor_agents"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement
DO $$ BEGIN
  ALTER TABLE "realtor_messages" ADD CONSTRAINT "realtor_messages_lead_id_realtor_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."realtor_leads"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement
DO $$ BEGIN
  ALTER TABLE "realtor_profiles" ADD CONSTRAINT "realtor_profiles_photo_media_id_realtor_media_id_fk" FOREIGN KEY ("photo_media_id") REFERENCES "public"."realtor_media"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement
DO $$ BEGIN
  ALTER TABLE "realtor_profiles" ADD CONSTRAINT "realtor_profiles_logo_media_id_realtor_media_id_fk" FOREIGN KEY ("logo_media_id") REFERENCES "public"."realtor_media"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement
DO $$ BEGIN
  ALTER TABLE "equipment" ADD CONSTRAINT "equipment_home_id_homes_id_fk" FOREIGN KEY ("home_id") REFERENCES "public"."homes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement
DO $$ BEGIN
  ALTER TABLE "equipment" ADD CONSTRAINT "equipment_room_id_home_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."home_rooms"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement
DO $$ BEGIN
  ALTER TABLE "equipment" ADD CONSTRAINT "equipment_install_work_id_work_records_id_fk" FOREIGN KEY ("install_work_id") REFERENCES "public"."work_records"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement
DO $$ BEGIN
  ALTER TABLE "home_audit" ADD CONSTRAINT "home_audit_home_id_homes_id_fk" FOREIGN KEY ("home_id") REFERENCES "public"."homes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement
DO $$ BEGIN
  ALTER TABLE "home_invitations" ADD CONSTRAINT "home_invitations_home_id_homes_id_fk" FOREIGN KEY ("home_id") REFERENCES "public"."homes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement
DO $$ BEGIN
  ALTER TABLE "home_invitations" ADD CONSTRAINT "home_invitations_work_id_work_records_id_fk" FOREIGN KEY ("work_id") REFERENCES "public"."work_records"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement
DO $$ BEGIN
  ALTER TABLE "home_invitations" ADD CONSTRAINT "home_invitations_group_id_workers_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."workers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement
DO $$ BEGIN
  ALTER TABLE "home_invitations" ADD CONSTRAINT "home_invitations_placeholder_worker_id_workers_id_fk" FOREIGN KEY ("placeholder_worker_id") REFERENCES "public"."workers"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement
DO $$ BEGIN
  ALTER TABLE "home_media" ADD CONSTRAINT "home_media_home_id_homes_id_fk" FOREIGN KEY ("home_id") REFERENCES "public"."homes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement
DO $$ BEGIN
  ALTER TABLE "home_members" ADD CONSTRAINT "home_members_home_id_homes_id_fk" FOREIGN KEY ("home_id") REFERENCES "public"."homes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement
DO $$ BEGIN
  ALTER TABLE "home_rooms" ADD CONSTRAINT "home_rooms_home_id_homes_id_fk" FOREIGN KEY ("home_id") REFERENCES "public"."homes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement
DO $$ BEGIN
  ALTER TABLE "home_shares" ADD CONSTRAINT "home_shares_home_id_homes_id_fk" FOREIGN KEY ("home_id") REFERENCES "public"."homes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement
DO $$ BEGIN
  ALTER TABLE "infrastructure_items" ADD CONSTRAINT "infrastructure_items_home_id_homes_id_fk" FOREIGN KEY ("home_id") REFERENCES "public"."homes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement
DO $$ BEGIN
  ALTER TABLE "infrastructure_items" ADD CONSTRAINT "infrastructure_items_room_id_home_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."home_rooms"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement
DO $$ BEGIN
  ALTER TABLE "infrastructure_items" ADD CONSTRAINT "infrastructure_items_work_id_work_records_id_fk" FOREIGN KEY ("work_id") REFERENCES "public"."work_records"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement
DO $$ BEGIN
  ALTER TABLE "infrastructure_items" ADD CONSTRAINT "infrastructure_items_media_id_home_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."home_media"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement
DO $$ BEGIN
  ALTER TABLE "service_interests" ADD CONSTRAINT "service_interests_home_id_homes_id_fk" FOREIGN KEY ("home_id") REFERENCES "public"."homes"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement
DO $$ BEGIN
  ALTER TABLE "stage_photo_invites" ADD CONSTRAINT "stage_photo_invites_home_id_homes_id_fk" FOREIGN KEY ("home_id") REFERENCES "public"."homes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement
DO $$ BEGIN
  ALTER TABLE "stage_photo_invites" ADD CONSTRAINT "stage_photo_invites_work_id_work_records_id_fk" FOREIGN KEY ("work_id") REFERENCES "public"."work_records"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement
DO $$ BEGIN
  ALTER TABLE "work_approvals" ADD CONSTRAINT "work_approvals_work_id_work_records_id_fk" FOREIGN KEY ("work_id") REFERENCES "public"."work_records"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement
DO $$ BEGIN
  ALTER TABLE "work_notes" ADD CONSTRAINT "work_notes_work_id_work_records_id_fk" FOREIGN KEY ("work_id") REFERENCES "public"."work_records"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement
DO $$ BEGIN
  ALTER TABLE "work_participants" ADD CONSTRAINT "work_participants_work_id_work_records_id_fk" FOREIGN KEY ("work_id") REFERENCES "public"."work_records"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement
DO $$ BEGIN
  ALTER TABLE "work_participants" ADD CONSTRAINT "work_participants_worker_id_workers_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."workers"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement
DO $$ BEGIN
  ALTER TABLE "work_records" ADD CONSTRAINT "work_records_home_id_homes_id_fk" FOREIGN KEY ("home_id") REFERENCES "public"."homes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement
DO $$ BEGIN
  ALTER TABLE "work_records" ADD CONSTRAINT "work_records_room_id_home_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."home_rooms"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement
DO $$ BEGIN
  ALTER TABLE "worker_memberships" ADD CONSTRAINT "worker_memberships_group_id_workers_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."workers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement
DO $$ BEGIN
  ALTER TABLE "worker_memberships" ADD CONSTRAINT "worker_memberships_member_id_workers_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."workers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement
DO $$ BEGIN
  ALTER TABLE "worker_reviews" ADD CONSTRAINT "worker_reviews_work_id_work_records_id_fk" FOREIGN KEY ("work_id") REFERENCES "public"."work_records"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement
DO $$ BEGIN
  ALTER TABLE "worker_reviews" ADD CONSTRAINT "worker_reviews_worker_id_workers_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."workers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement
DO $$ BEGIN
  ALTER TABLE "valuations" ADD CONSTRAINT "valuations_subject_id_listing_snapshots_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."listing_snapshots"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement
DO $$ BEGIN
  ALTER TABLE "protocol_approvals" ADD CONSTRAINT "protocol_approvals_protocol_id_handover_protocols_id_fk" FOREIGN KEY ("protocol_id") REFERENCES "public"."handover_protocols"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement
DO $$ BEGIN
  ALTER TABLE "protocol_defects" ADD CONSTRAINT "protocol_defects_protocol_id_handover_protocols_id_fk" FOREIGN KEY ("protocol_id") REFERENCES "public"."handover_protocols"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement
DO $$ BEGIN
  ALTER TABLE "protocol_defects" ADD CONSTRAINT "protocol_defects_room_id_protocol_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."protocol_rooms"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement
DO $$ BEGIN
  ALTER TABLE "protocol_events" ADD CONSTRAINT "protocol_events_protocol_id_handover_protocols_id_fk" FOREIGN KEY ("protocol_id") REFERENCES "public"."handover_protocols"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement
DO $$ BEGIN
  ALTER TABLE "protocol_invites" ADD CONSTRAINT "protocol_invites_protocol_id_handover_protocols_id_fk" FOREIGN KEY ("protocol_id") REFERENCES "public"."handover_protocols"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement
DO $$ BEGIN
  ALTER TABLE "protocol_items" ADD CONSTRAINT "protocol_items_protocol_id_handover_protocols_id_fk" FOREIGN KEY ("protocol_id") REFERENCES "public"."handover_protocols"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement
DO $$ BEGIN
  ALTER TABLE "protocol_items" ADD CONSTRAINT "protocol_items_room_id_protocol_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."protocol_rooms"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement
DO $$ BEGIN
  ALTER TABLE "protocol_media" ADD CONSTRAINT "protocol_media_protocol_id_handover_protocols_id_fk" FOREIGN KEY ("protocol_id") REFERENCES "public"."handover_protocols"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement
DO $$ BEGIN
  ALTER TABLE "protocol_participants" ADD CONSTRAINT "protocol_participants_protocol_id_handover_protocols_id_fk" FOREIGN KEY ("protocol_id") REFERENCES "public"."handover_protocols"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement
DO $$ BEGIN
  ALTER TABLE "protocol_rooms" ADD CONSTRAINT "protocol_rooms_protocol_id_handover_protocols_id_fk" FOREIGN KEY ("protocol_id") REFERENCES "public"."handover_protocols"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement
DO $$ BEGIN
  ALTER TABLE "protocol_versions" ADD CONSTRAINT "protocol_versions_protocol_id_handover_protocols_id_fk" FOREIGN KEY ("protocol_id") REFERENCES "public"."handover_protocols"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement
DO $$ BEGIN
  ALTER TABLE "rental_invites" ADD CONSTRAINT "rental_invites_rental_id_rentals_id_fk" FOREIGN KEY ("rental_id") REFERENCES "public"."rentals"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement
DO $$ BEGIN
  ALTER TABLE "rental_participants" ADD CONSTRAINT "rental_participants_rental_id_rentals_id_fk" FOREIGN KEY ("rental_id") REFERENCES "public"."rentals"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement
DO $$ BEGIN
  ALTER TABLE "finance_budget_versions" ADD CONSTRAINT "finance_budget_versions_project_id_home_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."home_projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement
DO $$ BEGIN
  ALTER TABLE "finance_change_orders" ADD CONSTRAINT "finance_change_orders_project_id_home_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."home_projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement
DO $$ BEGIN
  ALTER TABLE "finance_change_orders" ADD CONSTRAINT "finance_change_orders_party_id_finance_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."finance_parties"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement
DO $$ BEGIN
  ALTER TABLE "finance_expense_items" ADD CONSTRAINT "finance_expense_items_expense_id_finance_expenses_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."finance_expenses"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement
DO $$ BEGIN
  ALTER TABLE "finance_expenses" ADD CONSTRAINT "finance_expenses_project_id_home_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."home_projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement
DO $$ BEGIN
  ALTER TABLE "finance_expenses" ADD CONSTRAINT "finance_expenses_home_id_homes_id_fk" FOREIGN KEY ("home_id") REFERENCES "public"."homes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement
DO $$ BEGIN
  ALTER TABLE "finance_expenses" ADD CONSTRAINT "finance_expenses_party_id_finance_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."finance_parties"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement
DO $$ BEGIN
  ALTER TABLE "finance_expenses" ADD CONSTRAINT "finance_expenses_room_id_home_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."home_rooms"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement
DO $$ BEGIN
  ALTER TABLE "finance_expenses" ADD CONSTRAINT "finance_expenses_funded_by_party_id_finance_parties_id_fk" FOREIGN KEY ("funded_by_party_id") REFERENCES "public"."finance_parties"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement
DO $$ BEGIN
  ALTER TABLE "finance_invoices" ADD CONSTRAINT "finance_invoices_project_id_home_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."home_projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement
DO $$ BEGIN
  ALTER TABLE "finance_invoices" ADD CONSTRAINT "finance_invoices_home_id_homes_id_fk" FOREIGN KEY ("home_id") REFERENCES "public"."homes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement
DO $$ BEGIN
  ALTER TABLE "finance_invoices" ADD CONSTRAINT "finance_invoices_media_id_home_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."home_media"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement
DO $$ BEGIN
  ALTER TABLE "finance_parties" ADD CONSTRAINT "finance_parties_project_id_home_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."home_projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement
DO $$ BEGIN
  ALTER TABLE "finance_parties" ADD CONSTRAINT "finance_parties_home_id_homes_id_fk" FOREIGN KEY ("home_id") REFERENCES "public"."homes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement
DO $$ BEGIN
  ALTER TABLE "finance_parties" ADD CONSTRAINT "finance_parties_worker_id_workers_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."workers"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement
DO $$ BEGIN
  ALTER TABLE "finance_payments" ADD CONSTRAINT "finance_payments_project_id_home_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."home_projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement
DO $$ BEGIN
  ALTER TABLE "finance_payments" ADD CONSTRAINT "finance_payments_home_id_homes_id_fk" FOREIGN KEY ("home_id") REFERENCES "public"."homes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement
DO $$ BEGIN
  ALTER TABLE "finance_payments" ADD CONSTRAINT "finance_payments_party_id_finance_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."finance_parties"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement
DO $$ BEGIN
  ALTER TABLE "home_projects" ADD CONSTRAINT "home_projects_home_id_homes_id_fk" FOREIGN KEY ("home_id") REFERENCES "public"."homes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement
DO $$ BEGIN
  ALTER TABLE "media_stage_tags" ADD CONSTRAINT "media_stage_tags_media_id_home_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."home_media"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement
DO $$ BEGIN
  ALTER TABLE "media_stage_tags" ADD CONSTRAINT "media_stage_tags_home_id_homes_id_fk" FOREIGN KEY ("home_id") REFERENCES "public"."homes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement
DO $$ BEGIN
  ALTER TABLE "ai_estimate_files" ADD CONSTRAINT "ai_estimate_files_estimate_id_ai_estimates_id_fk" FOREIGN KEY ("estimate_id") REFERENCES "public"."ai_estimates"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement
DO $$ BEGIN
  ALTER TABLE "ai_estimate_versions" ADD CONSTRAINT "ai_estimate_versions_estimate_id_ai_estimates_id_fk" FOREIGN KEY ("estimate_id") REFERENCES "public"."ai_estimates"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement
DO $$ BEGIN
  ALTER TABLE "ai_estimates" ADD CONSTRAINT "ai_estimates_home_id_homes_id_fk" FOREIGN KEY ("home_id") REFERENCES "public"."homes"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement
CREATE INDEX IF NOT EXISTS "change_orders_project_idx" ON "change_orders" USING btree ("project_id");
--> statement
CREATE UNIQUE INDEX IF NOT EXISTS "change_orders_project_number_idx" ON "change_orders" USING btree ("project_id","number");
--> statement
CREATE INDEX IF NOT EXISTS "renovation_milestones_project_idx" ON "renovation_milestones" USING btree ("project_id");
--> statement
CREATE INDEX IF NOT EXISTS "project_media_entity_idx" ON "project_media" USING btree ("entity_type","entity_id");
--> statement
CREATE INDEX IF NOT EXISTS "project_media_project_idx" ON "project_media" USING btree ("project_id");
--> statement
CREATE UNIQUE INDEX IF NOT EXISTS "project_media_object_path_idx" ON "project_media" USING btree ("object_path");
--> statement
CREATE INDEX IF NOT EXISTS "project_participants_user_idx" ON "project_participants" USING btree ("user_id");
--> statement
CREATE INDEX IF NOT EXISTS "project_participants_project_idx" ON "project_participants" USING btree ("project_id");
--> statement
CREATE UNIQUE INDEX IF NOT EXISTS "project_participants_invite_token_idx" ON "project_participants" USING btree ("invite_token_hash");
--> statement
CREATE UNIQUE INDEX IF NOT EXISTS "project_participants_project_user_idx" ON "project_participants" USING btree ("project_id","user_id");
--> statement
CREATE UNIQUE INDEX IF NOT EXISTS "project_participants_contractor_idx" ON "project_participants" USING btree ("project_id") WHERE "project_participants"."role" = 'contractor' AND "project_participants"."accepted_at" IS NOT NULL;
--> statement
CREATE INDEX IF NOT EXISTS "project_payments_project_idx" ON "project_payments" USING btree ("project_id");
--> statement
CREATE INDEX IF NOT EXISTS "renovation_projects_owner_idx" ON "renovation_projects" USING btree ("owner_user_id");
--> statement
CREATE INDEX IF NOT EXISTS "renovation_rooms_project_idx" ON "renovation_rooms" USING btree ("project_id");
--> statement
CREATE INDEX IF NOT EXISTS "revision_requests_project_idx" ON "revision_requests" USING btree ("project_id");
--> statement
CREATE INDEX IF NOT EXISTS "revision_requests_milestone_idx" ON "revision_requests" USING btree ("milestone_id");
--> statement
CREATE INDEX IF NOT EXISTS "scope_items_project_version_idx" ON "scope_items" USING btree ("project_id","scope_version");
--> statement
CREATE INDEX IF NOT EXISTS "renovation_timeline_project_idx" ON "renovation_timeline_events" USING btree ("project_id","created_at");
--> statement
CREATE INDEX IF NOT EXISTS "smeta_change_orders_project_idx" ON "smeta_change_orders" USING btree ("project_id","number");
--> statement
CREATE UNIQUE INDEX IF NOT EXISTS "smeta_client_approvals_project_version_idx" ON "smeta_client_approvals" USING btree ("project_id","version");
--> statement
CREATE UNIQUE INDEX IF NOT EXISTS "smeta_estimate_versions_project_version_idx" ON "smeta_estimate_versions" USING btree ("project_id","version");
--> statement
CREATE INDEX IF NOT EXISTS "smeta_line_items_section_idx" ON "smeta_line_items" USING btree ("project_id","section_id");
--> statement
CREATE INDEX IF NOT EXISTS "smeta_projects_owner_idx" ON "smeta_projects" USING btree ("owner_user_id","updated_at");
--> statement
CREATE INDEX IF NOT EXISTS "smeta_revision_requests_project_idx" ON "smeta_revision_requests" USING btree ("project_id","created_at");
--> statement
CREATE INDEX IF NOT EXISTS "passport_works_passport_idx" ON "passport_works" USING btree ("passport_id","position");
--> statement
CREATE UNIQUE INDEX IF NOT EXISTS "passport_works_contractor_token_idx" ON "passport_works" USING btree ("contractor_token_hash");
--> statement
CREATE UNIQUE INDEX IF NOT EXISTS "property_passports_public_id_idx" ON "property_passports" USING btree ("public_id");
--> statement
CREATE INDEX IF NOT EXISTS "property_passports_owner_idx" ON "property_passports" USING btree ("owner_user_id");
--> statement
CREATE UNIQUE INDEX IF NOT EXISTS "property_passports_owner_token_idx" ON "property_passports" USING btree ("owner_token_hash");
--> statement
CREATE INDEX IF NOT EXISTS "realtor_agents_owner_idx" ON "realtor_agents" USING btree ("owner_user_id");
--> statement
CREATE INDEX IF NOT EXISTS "realtor_appointments_owner_idx" ON "realtor_appointments" USING btree ("owner_user_id","starts_at");
--> statement
CREATE INDEX IF NOT EXISTS "realtor_events_owner_idx" ON "realtor_events" USING btree ("owner_user_id","created_at");
--> statement
CREATE INDEX IF NOT EXISTS "realtor_events_passport_idx" ON "realtor_events" USING btree ("passport_id","kind");
--> statement
CREATE INDEX IF NOT EXISTS "realtor_leads_owner_idx" ON "realtor_leads" USING btree ("owner_user_id","status");
--> statement
CREATE INDEX IF NOT EXISTS "realtor_leads_phone_idx" ON "realtor_leads" USING btree ("owner_user_id","phone");
--> statement
CREATE INDEX IF NOT EXISTS "realtor_listings_owner_idx" ON "realtor_listings" USING btree ("owner_user_id","status");
--> statement
CREATE UNIQUE INDEX IF NOT EXISTS "realtor_media_object_path_idx" ON "realtor_media" USING btree ("object_path");
--> statement
CREATE INDEX IF NOT EXISTS "realtor_media_owner_idx" ON "realtor_media" USING btree ("owner_user_id");
--> statement
CREATE INDEX IF NOT EXISTS "realtor_messages_lead_idx" ON "realtor_messages" USING btree ("lead_id","created_at");
--> statement
CREATE INDEX IF NOT EXISTS "realtor_messages_owner_idx" ON "realtor_messages" USING btree ("owner_user_id","created_at");
--> statement
CREATE INDEX IF NOT EXISTS "realtor_notifications_owner_idx" ON "realtor_notifications" USING btree ("owner_user_id","created_at");
--> statement
CREATE UNIQUE INDEX IF NOT EXISTS "realtor_whatsapp_phone_number_idx" ON "realtor_whatsapp_settings" USING btree ("phone_number_id");
--> statement
CREATE INDEX IF NOT EXISTS "equipment_home_idx" ON "equipment" USING btree ("home_id");
--> statement
CREATE INDEX IF NOT EXISTS "home_audit_home_idx" ON "home_audit" USING btree ("home_id","created_at");
--> statement
CREATE INDEX IF NOT EXISTS "home_audit_worker_idx" ON "home_audit" USING btree ("worker_id","created_at");
--> statement
CREATE UNIQUE INDEX IF NOT EXISTS "home_invitations_token_idx" ON "home_invitations" USING btree ("token_hash");
--> statement
CREATE INDEX IF NOT EXISTS "home_invitations_home_idx" ON "home_invitations" USING btree ("home_id");
--> statement
CREATE UNIQUE INDEX IF NOT EXISTS "home_media_object_idx" ON "home_media" USING btree ("object_path");
--> statement
CREATE INDEX IF NOT EXISTS "home_media_home_idx" ON "home_media" USING btree ("home_id","created_at");
--> statement
CREATE INDEX IF NOT EXISTS "home_media_work_idx" ON "home_media" USING btree ("work_id");
--> statement
CREATE UNIQUE INDEX IF NOT EXISTS "home_members_home_user_idx" ON "home_members" USING btree ("home_id","user_id");
--> statement
CREATE INDEX IF NOT EXISTS "home_members_user_idx" ON "home_members" USING btree ("user_id");
--> statement
CREATE INDEX IF NOT EXISTS "home_rooms_home_idx" ON "home_rooms" USING btree ("home_id","position");
--> statement
CREATE UNIQUE INDEX IF NOT EXISTS "home_shares_token_idx" ON "home_shares" USING btree ("token_hash");
--> statement
CREATE INDEX IF NOT EXISTS "home_shares_home_idx" ON "home_shares" USING btree ("home_id");
--> statement
CREATE UNIQUE INDEX IF NOT EXISTS "homes_public_id_idx" ON "homes" USING btree ("public_id");
--> statement
CREATE INDEX IF NOT EXISTS "homes_creator_idx" ON "homes" USING btree ("created_by_user_id");
--> statement
CREATE INDEX IF NOT EXISTS "infrastructure_items_home_idx" ON "infrastructure_items" USING btree ("home_id","type");
--> statement
CREATE INDEX IF NOT EXISTS "service_interests_kind_idx" ON "service_interests" USING btree ("kind","created_at");
--> statement
CREATE UNIQUE INDEX IF NOT EXISTS "stage_photo_invites_token_idx" ON "stage_photo_invites" USING btree ("token_hash");
--> statement
CREATE INDEX IF NOT EXISTS "stage_photo_invites_home_idx" ON "stage_photo_invites" USING btree ("home_id");
--> statement
CREATE INDEX IF NOT EXISTS "work_approvals_work_idx" ON "work_approvals" USING btree ("work_id","created_at");
--> statement
CREATE INDEX IF NOT EXISTS "work_notes_work_idx" ON "work_notes" USING btree ("work_id","created_at");
--> statement
CREATE UNIQUE INDEX IF NOT EXISTS "work_participants_work_worker_idx" ON "work_participants" USING btree ("work_id","worker_id");
--> statement
CREATE INDEX IF NOT EXISTS "work_participants_worker_idx" ON "work_participants" USING btree ("worker_id","status");
--> statement
CREATE INDEX IF NOT EXISTS "work_records_home_idx" ON "work_records" USING btree ("home_id","start_date");
--> statement
CREATE INDEX IF NOT EXISTS "work_records_room_idx" ON "work_records" USING btree ("room_id");
--> statement
CREATE INDEX IF NOT EXISTS "worker_memberships_group_idx" ON "worker_memberships" USING btree ("group_id","status");
--> statement
CREATE INDEX IF NOT EXISTS "worker_memberships_member_idx" ON "worker_memberships" USING btree ("member_id");
--> statement
CREATE UNIQUE INDEX IF NOT EXISTS "worker_reviews_unique_idx" ON "worker_reviews" USING btree ("work_id","worker_id","author_user_id");
--> statement
CREATE INDEX IF NOT EXISTS "worker_reviews_worker_idx" ON "worker_reviews" USING btree ("worker_id");
--> statement
CREATE UNIQUE INDEX IF NOT EXISTS "workers_individual_user_idx" ON "workers" USING btree ("user_id");
--> statement
CREATE INDEX IF NOT EXISTS "workers_manager_idx" ON "workers" USING btree ("manager_user_id");
--> statement
CREATE INDEX IF NOT EXISTS "workers_kind_idx" ON "workers" USING btree ("kind","status");
--> statement
CREATE INDEX IF NOT EXISTS "construction_estimates_owner_idx" ON "construction_estimates" USING btree ("owner_user_id","updated_at");
--> statement
CREATE INDEX IF NOT EXISTS "listing_snapshots_pool_idx" ON "listing_snapshots" USING btree ("in_pool","city","fetched_at");
--> statement
CREATE INDEX IF NOT EXISTS "listing_snapshots_url_idx" ON "listing_snapshots" USING btree ("url_hash");
--> statement
CREATE INDEX IF NOT EXISTS "valuations_owner_idx" ON "valuations" USING btree ("owner_user_id","created_at");
--> statement
CREATE INDEX IF NOT EXISTS "price_quotes_item_idx" ON "price_quotes" USING btree ("item_code","active");
--> statement
CREATE INDEX IF NOT EXISTS "repair_estimates_owner_idx" ON "repair_estimates" USING btree ("owner_user_id","updated_at");
--> statement
CREATE UNIQUE INDEX IF NOT EXISTS "handover_protocols_number_idx" ON "handover_protocols" USING btree ("number");
--> statement
CREATE INDEX IF NOT EXISTS "handover_protocols_creator_idx" ON "handover_protocols" USING btree ("created_by_user_id");
--> statement
CREATE UNIQUE INDEX IF NOT EXISTS "protocol_approvals_idx" ON "protocol_approvals" USING btree ("protocol_id","version","role");
--> statement
CREATE INDEX IF NOT EXISTS "protocol_defects_protocol_idx" ON "protocol_defects" USING btree ("protocol_id");
--> statement
CREATE INDEX IF NOT EXISTS "protocol_events_protocol_idx" ON "protocol_events" USING btree ("protocol_id","created_at");
--> statement
CREATE UNIQUE INDEX IF NOT EXISTS "protocol_invites_token_idx" ON "protocol_invites" USING btree ("token_hash");
--> statement
CREATE INDEX IF NOT EXISTS "protocol_invites_protocol_idx" ON "protocol_invites" USING btree ("protocol_id");
--> statement
CREATE INDEX IF NOT EXISTS "protocol_items_protocol_idx" ON "protocol_items" USING btree ("protocol_id","room_id");
--> statement
CREATE INDEX IF NOT EXISTS "protocol_media_protocol_idx" ON "protocol_media" USING btree ("protocol_id");
--> statement
CREATE UNIQUE INDEX IF NOT EXISTS "protocol_participants_role_idx" ON "protocol_participants" USING btree ("protocol_id","role");
--> statement
CREATE INDEX IF NOT EXISTS "protocol_participants_user_idx" ON "protocol_participants" USING btree ("user_id");
--> statement
CREATE INDEX IF NOT EXISTS "protocol_rooms_protocol_idx" ON "protocol_rooms" USING btree ("protocol_id","position");
--> statement
CREATE UNIQUE INDEX IF NOT EXISTS "protocol_versions_idx" ON "protocol_versions" USING btree ("protocol_id","version");
--> statement
CREATE UNIQUE INDEX IF NOT EXISTS "protocol_versions_verify_idx" ON "protocol_versions" USING btree ("verify_code");
--> statement
CREATE UNIQUE INDEX IF NOT EXISTS "rental_invites_token_idx" ON "rental_invites" USING btree ("token_hash");
--> statement
CREATE INDEX IF NOT EXISTS "rental_invites_rental_idx" ON "rental_invites" USING btree ("rental_id");
--> statement
CREATE UNIQUE INDEX IF NOT EXISTS "rental_participants_role_idx" ON "rental_participants" USING btree ("rental_id","role");
--> statement
CREATE INDEX IF NOT EXISTS "rental_participants_user_idx" ON "rental_participants" USING btree ("user_id");
--> statement
CREATE UNIQUE INDEX IF NOT EXISTS "rentals_number_idx" ON "rentals" USING btree ("number");
--> statement
CREATE INDEX IF NOT EXISTS "rentals_creator_idx" ON "rentals" USING btree ("created_by_user_id");
--> statement
CREATE UNIQUE INDEX IF NOT EXISTS "finance_budget_versions_idx" ON "finance_budget_versions" USING btree ("project_id","version");
--> statement
CREATE UNIQUE INDEX IF NOT EXISTS "finance_change_orders_number_idx" ON "finance_change_orders" USING btree ("project_id","number");
--> statement
CREATE INDEX IF NOT EXISTS "finance_expense_items_expense_idx" ON "finance_expense_items" USING btree ("expense_id");
--> statement
CREATE INDEX IF NOT EXISTS "finance_expenses_project_idx" ON "finance_expenses" USING btree ("project_id","date");
--> statement
CREATE INDEX IF NOT EXISTS "finance_expenses_entry_idx" ON "finance_expenses" USING btree ("entry_id");
--> statement
CREATE UNIQUE INDEX IF NOT EXISTS "finance_expenses_idem_idx" ON "finance_expenses" USING btree ("project_id","idempotency_key");
--> statement
CREATE INDEX IF NOT EXISTS "finance_invoices_project_idx" ON "finance_invoices" USING btree ("project_id","created_at");
--> statement
CREATE INDEX IF NOT EXISTS "finance_invoices_sha_idx" ON "finance_invoices" USING btree ("home_id","sha256");
--> statement
CREATE INDEX IF NOT EXISTS "finance_parties_project_idx" ON "finance_parties" USING btree ("project_id");
--> statement
CREATE INDEX IF NOT EXISTS "finance_parties_user_idx" ON "finance_parties" USING btree ("user_id");
--> statement
CREATE UNIQUE INDEX IF NOT EXISTS "finance_parties_invite_idx" ON "finance_parties" USING btree ("invite_token_hash");
--> statement
CREATE INDEX IF NOT EXISTS "finance_payments_project_idx" ON "finance_payments" USING btree ("project_id","date");
--> statement
CREATE UNIQUE INDEX IF NOT EXISTS "finance_payments_idem_idx" ON "finance_payments" USING btree ("project_id","idempotency_key");
--> statement
CREATE INDEX IF NOT EXISTS "home_projects_home_idx" ON "home_projects" USING btree ("home_id","created_at");
--> statement
CREATE UNIQUE INDEX IF NOT EXISTS "media_stage_tags_media_idx" ON "media_stage_tags" USING btree ("media_id");
--> statement
CREATE INDEX IF NOT EXISTS "media_stage_tags_home_idx" ON "media_stage_tags" USING btree ("home_id","stage");
--> statement
CREATE INDEX IF NOT EXISTS "media_stage_tags_queue_idx" ON "media_stage_tags" USING btree ("ai_status","created_at");
--> statement
CREATE INDEX IF NOT EXISTS "ai_estimate_files_estimate_idx" ON "ai_estimate_files" USING btree ("estimate_id");
--> statement
CREATE UNIQUE INDEX IF NOT EXISTS "ai_estimate_files_object_idx" ON "ai_estimate_files" USING btree ("object_path");
--> statement
CREATE UNIQUE INDEX IF NOT EXISTS "ai_estimate_versions_idx" ON "ai_estimate_versions" USING btree ("estimate_id","version");
--> statement
CREATE INDEX IF NOT EXISTS "ai_estimates_owner_idx" ON "ai_estimates" USING btree ("owner_user_id","updated_at");
--> statement
ALTER TABLE "stage_photo_invites" ALTER COLUMN "work_id" DROP NOT NULL;
