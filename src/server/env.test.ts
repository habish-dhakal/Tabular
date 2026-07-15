import { describe, expect, it } from "vitest";

import { validateRuntimeEnv } from "./env";

describe("validateRuntimeEnv", () => {
  it("rejects production without a database URL and strong auth secret", () => {
    const report = validateRuntimeEnv({ NODE_ENV: "production" });

    expect(report.ok).toBe(false);
    expect(report.errors).toEqual([
      "DATABASE_URL is required in production.",
      "AUTH_SECRET or NEXTAUTH_SECRET must be at least 32 characters in production.",
    ]);
  });

  it("rejects dev-login in production", () => {
    const report = validateRuntimeEnv({
      NODE_ENV: "production",
      DATABASE_URL: "postgres://example",
      AUTH_SECRET: "x".repeat(32),
      ALLOW_DEV_LOGIN: "1",
    });

    expect(report.ok).toBe(false);
    expect(report.errors).toContain("ALLOW_DEV_LOGIN cannot be enabled in production.");
  });

  it("allows production with required secrets while warning about optional services", () => {
    const report = validateRuntimeEnv({
      NODE_ENV: "production",
      DATABASE_URL: "postgres://example",
      AUTH_SECRET: "x".repeat(32),
      AUTH_URL: "https://tabular.example",
    });

    expect(report.ok).toBe(true);
    expect(report.warnings).toContain(
      "REDIS_URL is not set; automations and shared rate limits will be unavailable."
    );
    expect(report.warnings).toContain(
      "AUTH_GITHUB_ID and AUTH_GITHUB_SECRET are not set; no production OAuth provider is configured."
    );
  });
});
