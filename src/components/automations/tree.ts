import type { ActionNode, AutomationAction } from "@/lib/types";

/** Max nesting depth of loop/conditional groups (mirrors the server's cap). */
export const MAX_GROUP_DEPTH = 3;

/** Assemble the API's flat, position-ordered action rows into a builder tree. */
export function buildTree(flat: AutomationAction[]): ActionNode[] {
  const byId = new Map<string, ActionNode>();
  for (const a of flat) {
    byId.set(a.id, {
      id: a.id,
      kind: a.kind ?? "action",
      type: a.type ?? null,
      config: a.config ?? {},
      children: [],
    });
  }
  const roots: ActionNode[] = [];
  for (const a of flat) {
    const node = byId.get(a.id)!;
    if (a.parentId && byId.has(a.parentId)) byId.get(a.parentId)!.children.push(node);
    else roots.push(node);
  }
  return roots;
}

/** A nested action payload the create/update API accepts. */
export interface NestedAction {
  kind: ActionNode["kind"];
  type?: ActionNode["type"];
  config: Record<string, unknown>;
  actions?: NestedAction[];
}

/** Serialize a builder tree into the API's nested action shape. */
export function toNested(nodes: ActionNode[]): NestedAction[] {
  return nodes.map((n) =>
    n.kind === "action"
      ? { kind: "action", type: n.type, config: n.config }
      : { kind: n.kind, config: n.config, actions: toNested(n.children) }
  );
}
