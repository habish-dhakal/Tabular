import type { Executor } from "./index";

export const httpRequest: Executor = async (input, ctx) => {
  const url = String(input.url ?? "").trim();
  if (!url) throw new Error("httpRequest: 'url' is required");
  const headers =
    input.headers && typeof input.headers === "object"
      ? Object.fromEntries(
          Object.entries(input.headers as Record<string, unknown>).map(([k, v]) => [k, String(v)])
        )
      : undefined;
  return ctx.senders.httpRequest({
    method: String(input.method ?? "POST"),
    url,
    headers,
    body: input.body != null ? String(input.body) : undefined,
  });
};
