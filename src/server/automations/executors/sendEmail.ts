import type { Executor } from "./index";

export const sendEmail: Executor = async (input, ctx) => {
  const to = String(input.to ?? "").trim();
  if (!to) throw new Error("sendEmail: 'to' is required");
  return ctx.senders.sendEmail({
    to,
    subject: String(input.subject ?? ""),
    body: String(input.body ?? ""),
    cc: input.cc ? String(input.cc) : undefined,
    bcc: input.bcc ? String(input.bcc) : undefined,
  });
};
