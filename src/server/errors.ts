import { randomUUID } from "node:crypto";

import { AccessError } from "@/server/services/access";

export interface ErrorEnvelope {
  error: string;
  code: string;
  requestId: string;
}

export class PublicError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "PublicError";
  }
}

export function requestIdFromHeaders(headers: { get(name: string): string | null }): string {
  return headers.get("x-request-id") || randomUUID();
}

export function envelopeForError(err: unknown, requestId: string): { status: number; body: ErrorEnvelope } {
  if (err instanceof AccessError) {
    return {
      status: err.status,
      body: { error: err.message, code: codeForAccessStatus(err.status), requestId },
    };
  }

  if (err instanceof PublicError) {
    return {
      status: err.status,
      body: { error: err.message, code: err.code, requestId },
    };
  }

  const developmentMessage = err instanceof Error ? err.message : "Unexpected error";
  return {
    status: 400,
    body: {
      error: process.env.NODE_ENV === "production" ? "Request failed." : developmentMessage,
      code: "REQUEST_FAILED",
      requestId,
    },
  };
}

function codeForAccessStatus(status: number): string {
  if (status === 401) return "AUTH_REQUIRED";
  if (status === 403) return "FORBIDDEN";
  if (status === 404) return "NOT_FOUND";
  return "ACCESS_DENIED";
}
