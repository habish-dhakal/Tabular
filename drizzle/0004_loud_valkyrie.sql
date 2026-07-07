ALTER TABLE "automation_action" ALTER COLUMN "type" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "automation_action" ADD COLUMN "kind" text DEFAULT 'action' NOT NULL;--> statement-breakpoint
ALTER TABLE "automation_action" ADD COLUMN "parent_id" text;--> statement-breakpoint
ALTER TABLE "automation_action" ADD CONSTRAINT "automation_action_parent_id_automation_action_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."automation_action"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "automation_action_parent_idx" ON "automation_action" USING btree ("parent_id");