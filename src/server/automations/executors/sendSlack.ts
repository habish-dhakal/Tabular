import type { Executor } from "./index";

export const sendSlack: Executor = async (input, ctx) => {
  const channel = String(input.channel ?? "").trim();
  if (!channel) throw new Error("sendSlack: 'channel' is required");
  return ctx.senders.sendSlack({ channel, text: String(input.text ?? "") });
};
