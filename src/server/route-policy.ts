import type { RateLimitAction } from "@/server/rate-limit";

export type RouteAuth = "public" | "user";
export type RouteAuthorization =
  | "none"
  | "self"
  | "next-auth"
  | "workspace-member"
  | "workspace-admin"
  | "base-member"
  | "base-editor"
  | "table-member"
  | "table-editor"
  | "record-table-member"
  | "record-table-editor"
  | "field-table-editor"
  | "view-table-member"
  | "view-table-editor"
  | "automation-table-member"
  | "automation-table-editor"
  | "comment-table-member"
  | "invite-token-user";

export type RouteValidation = "none" | "next-auth" | "query" | "zod" | "service";
export type RouteSideEffect = "none" | "write" | "delete" | "external";

export interface ApiRoutePolicy {
  route: string;
  auth: RouteAuth;
  authorization: RouteAuthorization;
  validation: RouteValidation;
  sideEffect: RouteSideEffect;
  rateLimit: RateLimitAction | "none";
  owner: "auth" | "health" | "workspace" | "base" | "table" | "record" | "field" | "view" | "automation" | "comment" | "notification" | "integration";
}

export const API_ROUTE_POLICIES = [
  policy("/auth/[...nextauth]", "public", "next-auth", "next-auth", "external", "auth", "auth"),
  policy("/health", "public", "none", "none", "none", "none", "health"),
  policy("/health/live", "public", "none", "none", "none", "none", "health"),
  policy("/health/ready", "public", "none", "none", "none", "none", "health"),
  policy("/workspaces", "user", "self", "none", "none", "api", "workspace"),
  policy("/workspaces/[workspaceId]/bases", "user", "workspace-member", "zod", "write", "write", "base"),
  policy("/workspaces/[workspaceId]/invites", "user", "workspace-admin", "zod", "write", "write", "workspace"),
  policy("/workspaces/[workspaceId]/invites/[inviteId]", "user", "workspace-admin", "service", "delete", "destructive", "workspace"),
  policy("/workspaces/[workspaceId]/members", "user", "workspace-member", "none", "none", "api", "workspace"),
  policy("/workspaces/[workspaceId]/members/[userId]", "user", "workspace-admin", "zod", "delete", "destructive", "workspace"),
  policy("/invites/[token]", "user", "invite-token-user", "service", "none", "api", "workspace"),
  policy("/invites/[token]/accept", "user", "invite-token-user", "service", "write", "write", "workspace"),
  policy("/bases/[baseId]", "user", "base-editor", "zod", "delete", "destructive", "base"),
  policy("/bases/[baseId]/tables", "user", "base-member", "zod", "write", "write", "table"),
  policy("/bases/[baseId]/export/json", "user", "base-member", "none", "none", "export", "base"),
  policy("/bases/[baseId]/import/preview", "user", "base-editor", "zod", "none", "import", "base"),
  policy("/bases/[baseId]/import/commit", "user", "base-editor", "zod", "write", "import", "base"),
  policy("/bases/[baseId]/airtable-import/plan", "user", "base-editor", "zod", "none", "import", "base"),
  policy("/tables/[tableId]", "user", "table-editor", "zod", "delete", "destructive", "table"),
  policy("/tables/[tableId]/records", "user", "table-member", "query", "write", "write", "record"),
  policy("/tables/[tableId]/fields", "user", "table-editor", "zod", "write", "write", "field"),
  policy("/tables/[tableId]/fields/reorder", "user", "table-editor", "zod", "write", "write", "field"),
  policy("/tables/[tableId]/views", "user", "table-member", "zod", "write", "write", "view"),
  policy("/tables/[tableId]/link-options", "user", "table-member", "none", "none", "api", "table"),
  policy("/tables/[tableId]/members", "user", "table-member", "none", "none", "api", "table"),
  policy("/tables/[tableId]/export/csv", "user", "table-member", "query", "none", "export", "table"),
  policy("/tables/[tableId]/import/preview", "user", "table-editor", "zod", "none", "import", "table"),
  policy("/tables/[tableId]/import/commit", "user", "table-editor", "zod", "write", "import", "table"),
  policy("/tables/[tableId]/automations", "user", "automation-table-member", "zod", "write", "automation", "automation"),
  policy("/records/[recordId]", "user", "record-table-editor", "zod", "delete", "destructive", "record"),
  policy("/records/[recordId]/links", "user", "record-table-editor", "zod", "write", "write", "record"),
  policy("/records/[recordId]/comments", "user", "record-table-member", "zod", "write", "write", "comment"),
  policy("/comments/[commentId]", "user", "comment-table-member", "service", "delete", "destructive", "comment"),
  policy("/fields/[fieldId]", "user", "field-table-editor", "zod", "delete", "destructive", "field"),
  policy("/fields/[fieldId]/conversion-preview", "user", "field-table-editor", "zod", "none", "api", "field"),
  policy("/views/[viewId]", "user", "view-table-editor", "zod", "delete", "destructive", "view"),
  policy("/views/[viewId]/records", "user", "view-table-member", "query", "none", "read", "view"),
  policy("/automations/[automationId]", "user", "automation-table-member", "zod", "delete", "destructive", "automation"),
  policy("/automations/[automationId]/runs", "user", "automation-table-member", "none", "none", "api", "automation"),
  policy("/automations/[automationId]/test", "user", "automation-table-editor", "zod", "write", "automation", "automation"),
  policy("/notifications", "user", "self", "zod", "write", "write", "notification"),
  policy("/slack/targets", "user", "self", "none", "external", "api", "integration"),
] as const satisfies readonly ApiRoutePolicy[];

export function assertUniqueRoutePolicies(policies: readonly ApiRoutePolicy[] = API_ROUTE_POLICIES): string[] {
  const seen = new Set<string>();
  const errors: string[] = [];
  for (const policy of policies) {
    if (seen.has(policy.route)) errors.push(`Duplicate route policy: ${policy.route}`);
    seen.add(policy.route);
  }
  return errors;
}

function policy(
  route: string,
  auth: RouteAuth,
  authorization: RouteAuthorization,
  validation: RouteValidation,
  sideEffect: RouteSideEffect,
  rateLimit: RateLimitAction | "none",
  owner: ApiRoutePolicy["owner"]
): ApiRoutePolicy {
  return { route, auth, authorization, validation, sideEffect, rateLimit, owner };
}
