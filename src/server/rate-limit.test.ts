import { describe, expect, it } from "vitest";

import {
  memoryCheck,
  rateLimitConfig,
  rateLimitConfigForAction,
  rateLimitKey,
  type WindowEntry,
} from "./rate-limit";

describe("rateLimitConfig", () => {
  it("stays disabled outside production unless forced", () => {
    expect(rateLimitConfig({ NODE_ENV: "development" })).toMatchObject({
      enabled: false,
      max: 240,
      windowSec: 60,
    });
  });

  it("honors explicit force, limit, and window settings", () => {
    expect(
      rateLimitConfig({
        NODE_ENV: "test",
        RATE_LIMIT_FORCE: "1",
        RATE_LIMIT_MAX: "10",
        RATE_LIMIT_WINDOW_SEC: "5",
      })
    ).toEqual({ enabled: true, max: 10, windowSec: 5 });
  });

  it("allows max=0 to disable the limiter", () => {
    expect(
      rateLimitConfig({
        NODE_ENV: "production",
        RATE_LIMIT_MAX: "0",
      }).enabled
    ).toBe(false);
  });

  it("supports action-specific buckets and overrides", () => {
    expect(rateLimitConfigForAction("import", { NODE_ENV: "production" })).toMatchObject({
      enabled: true,
      max: 30,
      windowSec: 60,
    });
    expect(
      rateLimitConfigForAction("import", {
        NODE_ENV: "production",
        RATE_LIMIT_IMPORT_MAX: "4",
        RATE_LIMIT_IMPORT_WINDOW_SEC: "10",
      })
    ).toEqual({ enabled: true, max: 4, windowSec: 10 });
  });

  it("builds action-aware keys with user scope preferred over IP scope", () => {
    expect(rateLimitKey({ action: "write", ip: "203.0.113.10", userId: "usr_1" })).toBe(
      "write:u:usr_1"
    );
    expect(rateLimitKey({ action: "import", ip: "203.0.113.10", workspaceId: "w1", baseId: "b1" })).toBe(
      "import:ip:203.0.113.10:w:w1:b:b1"
    );
  });
});

describe("memoryCheck", () => {
  it("allows requests until the fixed window is exhausted", () => {
    const store = new Map<string, WindowEntry>();

    expect(memoryCheck(store, "client", 1_000, 2, 60_000)).toEqual({
      allowed: true,
      limit: 2,
      remaining: 1,
      retryAfterSec: 0,
    });
    expect(memoryCheck(store, "client", 2_000, 2, 60_000)).toMatchObject({
      allowed: true,
      remaining: 0,
    });
    expect(memoryCheck(store, "client", 3_000, 2, 60_000)).toEqual({
      allowed: false,
      limit: 2,
      remaining: 0,
      retryAfterSec: 58,
    });
  });

  it("starts a new window after the reset time", () => {
    const store = new Map<string, WindowEntry>();

    memoryCheck(store, "client", 1_000, 1, 60_000);
    memoryCheck(store, "client", 2_000, 1, 60_000);

    expect(memoryCheck(store, "client", 61_000, 1, 60_000)).toEqual({
      allowed: true,
      limit: 1,
      remaining: 0,
      retryAfterSec: 0,
    });
  });
});
