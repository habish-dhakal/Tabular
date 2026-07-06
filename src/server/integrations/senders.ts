/**
 * Outbound integration senders.
 *
 * The executor layer talks only to this `Senders` interface, never to SDKs
 * directly, so the whole outbound surface can be swapped for no-network stubs.
 * `resolveSenders()` returns `stubSenders` when `AUTOMATIONS_STUB=1` or under
 * test — the stub echoes the resolved payload as the step output, which is the
 * assertion surface the verify suite reads back from the runs endpoint.
 */
export interface EmailInput {
  to: string;
  subject: string;
  body: string;
  cc?: string;
  bcc?: string;
}
export interface SlackInput {
  channel: string;
  text: string;
}
export interface SheetInput {
  spreadsheetId: string;
  sheetName?: string;
  values: string[];
}
export interface HttpInput {
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: string;
}

export interface Senders {
  sendEmail(input: EmailInput): Promise<Record<string, unknown>>;
  sendSlack(input: SlackInput): Promise<Record<string, unknown>>;
  appendGoogleSheet(input: SheetInput): Promise<Record<string, unknown>>;
  httpRequest(input: HttpInput): Promise<Record<string, unknown>>;
}

export const stubSenders: Senders = {
  async sendEmail(input) {
    return { stubbed: true, ...input };
  },
  async sendSlack(input) {
    return { stubbed: true, ...input };
  },
  async appendGoogleSheet(input) {
    return { stubbed: true, ...input };
  },
  async httpRequest(input) {
    return { stubbed: true, ...input };
  },
};

export function shouldStub(): boolean {
  return process.env.AUTOMATIONS_STUB === "1" || process.env.NODE_ENV === "test";
}

/**
 * Real senders lazy-load their SDK modules so the stub path (and the worker in
 * CI) never needs credentials or a live network. Imported on first use only.
 */
const realSenders: Senders = {
  async sendEmail(input) {
    const { sendEmail } = await import("./email");
    return sendEmail(input);
  },
  async sendSlack(input) {
    const { sendSlack } = await import("./slack");
    return sendSlack(input);
  },
  async appendGoogleSheet(input) {
    const { appendGoogleSheet } = await import("./google");
    return appendGoogleSheet(input);
  },
  async httpRequest(input) {
    const { httpRequest } = await import("./http");
    return httpRequest(input);
  },
};

export function resolveSenders(): Senders {
  return shouldStub() ? stubSenders : realSenders;
}
