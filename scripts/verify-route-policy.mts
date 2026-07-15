import { readdirSync, statSync } from "node:fs";
import path from "node:path";

import { API_ROUTE_POLICIES, assertUniqueRoutePolicies, type ApiRoutePolicy } from "@/server/route-policy";

const apiRoot = path.join(process.cwd(), "src", "app", "api");

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) return routeFiles(full);
    return entry === "route.ts" ? [full] : [];
  });
}

function routeFromFile(file: string): string {
  const relative = path.relative(apiRoot, file);
  return `/${relative.replace(/\/route\.ts$/, "").split(path.sep).join("/")}`;
}

function sorted(values: Iterable<string>): string[] {
  return [...values].sort((a, b) => a.localeCompare(b));
}

function verifyPolicies(policies: readonly ApiRoutePolicy[], actualRoutes: string[]): string[] {
  const errors = assertUniqueRoutePolicies(policies);
  const policyRoutes = new Set(policies.map((policy) => policy.route));
  const actualRouteSet = new Set(actualRoutes);

  for (const route of sorted(actualRouteSet)) {
    if (!policyRoutes.has(route)) errors.push(`Missing route policy for ${route}`);
  }

  for (const route of sorted(policyRoutes)) {
    if (!actualRouteSet.has(route)) errors.push(`Route policy has no route.ts file: ${route}`);
  }

  for (const policy of policies) {
    if (policy.auth === "public" && policy.authorization !== "none" && policy.authorization !== "next-auth") {
      errors.push(`Public route ${policy.route} cannot require ${policy.authorization}`);
    }
    if (policy.auth === "user" && policy.authorization === "none") {
      errors.push(`User route ${policy.route} must name an authorization boundary`);
    }
    if ((policy.sideEffect === "write" || policy.sideEffect === "delete") && policy.validation === "none") {
      errors.push(`Mutating route ${policy.route} must name validation`);
    }
    if (policy.sideEffect === "delete" && policy.rateLimit !== "destructive") {
      errors.push(`Delete route ${policy.route} must use destructive rate limiting`);
    }
    if (policy.route.includes("/import/") && policy.rateLimit !== "import") {
      errors.push(`Import route ${policy.route} must use import rate limiting`);
    }
    if (policy.route.includes("/export/") && policy.rateLimit !== "export") {
      errors.push(`Export route ${policy.route} must use export rate limiting`);
    }
  }

  return errors;
}

const actualRoutes = sorted(routeFiles(apiRoot).map(routeFromFile));
const errors = verifyPolicies(API_ROUTE_POLICIES, actualRoutes);

if (errors.length > 0) {
  console.error("Route policy verification failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`Route policy verification passed (${actualRoutes.length} API routes).`);
