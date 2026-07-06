import { handle, requireUserId } from "@/server/api-helpers";
import { shouldStub } from "@/server/integrations/senders";

/**
 * Slack channels + users for the sendSlack action picker. Uses the global
 * bot token. Returns `configured:false` (empty lists) when Slack isn't set up
 * so the builder degrades to manual entry instead of erroring.
 */
export async function GET() {
  return handle(async () => {
    await requireUserId();

    if (shouldStub()) {
      return {
        configured: true,
        channels: [
          { id: "C_STUB1", name: "#general", kind: "channel" },
          { id: "C_STUB2", name: "#random", kind: "channel" },
        ],
        users: [{ id: "U_STUB1", name: "@demo.user", kind: "user" }],
      };
    }

    if (!process.env.SLACK_BOT_TOKEN) {
      return { configured: false, channels: [], users: [] };
    }

    try {
      const { listSlackTargets } = await import("@/server/integrations/slack");
      const targets = await listSlackTargets();
      return { configured: true, ...targets };
    } catch (err) {
      return {
        configured: false,
        error: err instanceof Error ? err.message : "Slack error",
        channels: [],
        users: [],
      };
    }
  });
}
