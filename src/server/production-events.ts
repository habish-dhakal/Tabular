export type ProductionSafetyEventKind =
  | "base.delete"
  | "table.delete"
  | "field.delete"
  | "record.delete"
  | "view.delete"
  | "comment.delete"
  | "member.remove"
  | "invite.revoke"
  | "import.commit"
  | "export.csv"
  | "export.json"
  | "automation.delete";

export interface ProductionSafetyEvent {
  kind: ProductionSafetyEventKind;
  actorId?: string;
  workspaceId?: string;
  baseId?: string;
  tableId?: string;
  recordId?: string;
  targetId?: string;
  requestId?: string;
  details?: Record<string, unknown>;
}

export function emitProductionSafetyEvent(event: ProductionSafetyEvent): void {
  console.info(JSON.stringify({
    event: "production.safety",
    time: new Date().toISOString(),
    ...event,
  }));
}
