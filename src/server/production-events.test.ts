import { afterEach, describe, expect, it, vi } from "vitest";

import { emitProductionSafetyEvent } from "./production-events";

describe("emitProductionSafetyEvent", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("emits structured JSON with the production safety event name", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);

    emitProductionSafetyEvent({
      kind: "table.delete",
      actorId: "usr_1",
      tableId: "tbl_1",
      details: { reason: "test" },
    });

    const payload = JSON.parse(String(info.mock.calls[0][0]));
    expect(payload).toMatchObject({
      event: "production.safety",
      kind: "table.delete",
      actorId: "usr_1",
      tableId: "tbl_1",
      details: { reason: "test" },
    });
    expect(typeof payload.time).toBe("string");
  });
});
