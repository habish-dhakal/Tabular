import nodemailer, { type Transporter } from "nodemailer";
import type { EmailInput } from "./senders";

/**
 * SMTP email via nodemailer. Configure with either `SMTP_URL` or the discrete
 * `SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASS` vars; `EMAIL_FROM` sets the
 * sender. Only reached when senders are not stubbed.
 */
let transporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (transporter) return transporter;
  const url = process.env.SMTP_URL;
  if (url) {
    transporter = nodemailer.createTransport(url);
  } else if (process.env.SMTP_HOST) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 587),
      auth:
        process.env.SMTP_USER || process.env.SMTP_PASS
          ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
          : undefined,
    });
  } else {
    throw new Error("Email not configured: set SMTP_URL or SMTP_HOST");
  }
  return transporter;
}

export async function sendEmail(input: EmailInput): Promise<Record<string, unknown>> {
  const from = process.env.EMAIL_FROM;
  if (!from) throw new Error("Email not configured: set EMAIL_FROM");
  const info = await getTransporter().sendMail({
    from,
    to: input.to,
    cc: input.cc || undefined,
    bcc: input.bcc || undefined,
    subject: input.subject,
    text: input.body,
  });
  return { messageId: info.messageId, accepted: info.accepted, rejected: info.rejected };
}
