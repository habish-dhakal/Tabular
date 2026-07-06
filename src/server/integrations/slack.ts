import { WebClient } from "@slack/web-api";
import type { SlackInput } from "./senders";

/**
 * Slack message via a bot token (`SLACK_BOT_TOKEN`, needs `chat:write`).
 * Only reached when senders are not stubbed.
 */
let client: WebClient | null = null;

function getClient(): WebClient {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) throw new Error("Slack not configured: set SLACK_BOT_TOKEN");
  if (!client) client = new WebClient(token);
  return client;
}

export async function sendSlack(input: SlackInput): Promise<Record<string, unknown>> {
  const client = getClient();
  let channel = input.channel;
  // A user id (U…/W…) isn't a channel — open the bot↔user DM first (needs
  // `im:write`), then post to the resulting IM channel. Channel ids (#/C/G/D)
  // and names are posted to directly.
  if (/^[UW][A-Z0-9]+$/.test(channel)) {
    const opened = await client.conversations.open({ users: channel });
    channel = opened.channel?.id ?? channel;
  }
  const res = await client.chat.postMessage({ channel, text: input.text });
  return { ok: res.ok, channel: res.channel, ts: res.ts };
}

export interface SlackTarget {
  id: string;
  name: string;
  kind: "channel" | "user";
}

/**
 * List channels the bot can post to + workspace members, for the action
 * builder's "send to" picker. Needs `channels:read`/`groups:read` and
 * `users:read` scopes. Paginates with a sane page cap for large workspaces.
 */
export async function listSlackTargets(): Promise<{ channels: SlackTarget[]; users: SlackTarget[] }> {
  const client = getClient();
  const MAX_PAGES = 10;

  const channels: SlackTarget[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await client.conversations.list({
      types: "public_channel,private_channel",
      exclude_archived: true,
      limit: 200,
      cursor,
    });
    for (const c of res.channels ?? []) {
      if (c.id && c.name) channels.push({ id: c.id, name: `#${c.name}`, kind: "channel" });
    }
    cursor = res.response_metadata?.next_cursor || undefined;
    if (!cursor) break;
  }

  const users: SlackTarget[] = [];
  cursor = undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await client.users.list({ limit: 200, cursor });
    for (const u of res.members ?? []) {
      if (u.deleted || u.is_bot || u.id === "USLACKBOT" || !u.id) continue;
      const name = u.profile?.display_name || u.name || u.id;
      users.push({ id: u.id, name: `@${name}`, kind: "user" });
    }
    cursor = res.response_metadata?.next_cursor || undefined;
    if (!cursor) break;
  }

  channels.sort((a, b) => a.name.localeCompare(b.name));
  users.sort((a, b) => a.name.localeCompare(b.name));
  return { channels, users };
}
