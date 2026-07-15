import { describe, expect, it } from "vitest";

import { API_ROUTE_POLICIES, assertUniqueRoutePolicies } from "./route-policy";

describe("API_ROUTE_POLICIES", () => {
  it("has one policy per route", () => {
    expect(assertUniqueRoutePolicies(API_ROUTE_POLICIES)).toEqual([]);
  });

  it("keeps public routes intentionally narrow", () => {
    const publicRoutes = API_ROUTE_POLICIES.filter((policy) => policy.auth === "public").map(
      (policy) => policy.route
    );

    expect(publicRoutes).toEqual(["/auth/[...nextauth]", "/health", "/health/live", "/health/ready"]);
  });

  it("uses stricter buckets for expensive and destructive routes", () => {
    for (const policy of API_ROUTE_POLICIES) {
      if (policy.route.includes("/import/")) expect(policy.rateLimit).toBe("import");
      if (policy.route.includes("/export/")) expect(policy.rateLimit).toBe("export");
      if (policy.sideEffect === "delete") expect(policy.rateLimit).toBe("destructive");
    }
  });
});
