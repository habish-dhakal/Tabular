CREATE TABLE "workspace_invite" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"role" text DEFAULT 'editor' NOT NULL,
	"email" text,
	"invited_by_id" text,
	"accepted_by_id" text,
	"accepted_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workspace_invite" ADD CONSTRAINT "workspace_invite_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_invite" ADD CONSTRAINT "workspace_invite_invited_by_id_user_id_fk" FOREIGN KEY ("invited_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_invite" ADD CONSTRAINT "workspace_invite_accepted_by_id_user_id_fk" FOREIGN KEY ("accepted_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "workspace_invite_ws_idx" ON "workspace_invite" USING btree ("workspace_id");