import { describe, expect, it } from "vitest";

import { parseCsv } from "@/lib/csv";
import { buildCsvImportPlan, inferFieldType, inferFieldTypeProfile, planAirtableImport } from "@/lib/import-export";
import type { FieldDTO, RecordDTO } from "@/lib/types";

const field = (
  id: string,
  name: string,
  type: FieldDTO["type"],
  options: Record<string, unknown> = {}
): FieldDTO => ({ id, tableId: "tbl_1", name, type, options, position: 0, isPrimary: false });

const record = (id: string, cells: Record<string, unknown> = {}): RecordDTO => ({
  id,
  tableId: "tbl_1",
  cells,
  position: 0,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
});

describe("CSV import planning", () => {
  it("infers field types from source values", () => {
    expect(inferFieldType(["1", "2"])).toBe("number");
    expect(inferFieldType(["true", "false"])).toBe("checkbox");
    expect(inferFieldType(["a@example.com"])).toBe("email");
    expect(inferFieldType(["https://example.com"])).toBe("url");
    expect(inferFieldType(["Todo", "Done", "Todo"], "Task Status")).toBe("singleSelect");
    expect(inferFieldType(["75%", "10%"], "Completion Percentage")).toBe("percent");
    expect(inferFieldType(["2026/07/14", "2026/07/15"], "Due Date")).toBe("date");
    expect(inferFieldType(["SP-001", "SP-002"], "SecurityPal Customer ID")).toBe("singleLineText");
  });

  it("returns explainable inference confidence", () => {
    const inferred = inferFieldTypeProfile("Task Status", ["Todo", "Done", "Todo"]);

    expect(inferred.type).toBe("singleSelect");
    expect(inferred.confidence).toBeGreaterThan(0.7);
    expect(inferred.reasons.join(" ")).toContain("status");
  });

  it("reports invalid rows before writes", () => {
    const fields = [field("fld_name", "Name", "singleLineText"), field("fld_score", "Score", "number")];
    const plan = buildCsvImportPlan(parseCsv("Name,Score\nAlpha,10\nBeta,nope"), fields, []);

    expect(plan.validRows).toBe(1);
    expect(plan.invalidRows).toBe(1);
    expect(plan.rows[1].issues[0].message).toContain("Not a number");
  });

  it("reports unique conflicts against existing records and source duplicates", () => {
    const externalId = field("fld_ext", "External ID", "singleLineText", { unique: true });
    const existing = [record("rec_1", { [externalId.id]: "T-1" })];

    const plan = buildCsvImportPlan(parseCsv("External ID\nT-1\nT-2\nT-2"), [externalId], existing);

    expect(plan.validRows).toBe(1);
    expect(plan.invalidRows).toBe(2);
  });

  it("allows explicit mappings to safe writable field types", () => {
    const plan = buildCsvImportPlan(parseCsv("Cost\n12.50"), [], [], {
      mappings: [{ header: "Cost", action: "create", type: "currency" }],
    });

    expect(plan.columns[0]).toMatchObject({ action: "create", type: "currency" });
    expect(plan.validRows).toBe(1);
  });

  it("plans duplicate Airtable CSV headers as separate import columns", () => {
    const plan = buildCsvImportPlan(parseCsv("Questionnaire Wizard?,Questionnaire Wizard?\nYes,No"), [], []);

    expect(plan.headers).toEqual(["Questionnaire Wizard?", "Questionnaire Wizard? (2)"]);
    expect(plan.columns.map((column) => column.fieldName)).toEqual(["Questionnaire Wizard?", "Questionnaire Wizard? (2)"]);
    expect(plan.rows[0].source).toEqual({
      "Questionnaire Wizard?": "Yes",
      "Questionnaire Wizard? (2)": "No",
    });
  });

  it("accepts signed Airtable SLA duration columns and stores them in seconds", () => {
    const plan = buildCsvImportPlan(
      parseCsv("Questionnaire,Hours Left (Lower Bound),Email Confirm Time(minutes),SLA Upper bound (Days)\nQ1,-11,60,5.0\nQ2,-40,747,1.5"),
      [],
      []
    );
    const lowerBound = plan.columns.find((column) => column.header === "Hours Left (Lower Bound)");
    const confirmTime = plan.columns.find((column) => column.header === "Email Confirm Time(minutes)");
    const upperDays = plan.columns.find((column) => column.header === "SLA Upper bound (Days)");

    expect(plan.invalidRows).toBe(0);
    expect(lowerBound).toMatchObject({ type: "duration", options: { unit: "hours" } });
    expect(confirmTime).toMatchObject({ type: "duration", options: { unit: "minutes" } });
    expect(upperDays).toMatchObject({ type: "duration", options: { unit: "days" } });
    expect(plan.rows[0].cells[lowerBound!.tempFieldId!]).toBe(-39_600);
    expect(plan.rows[0].cells[confirmTime!.tempFieldId!]).toBe(3_600);
    expect(plan.rows[0].cells[upperDays!.tempFieldId!]).toBe(432_000);
    expect(plan.rows[1].cells[lowerBound!.tempFieldId!]).toBe(-144_000);
  });

  it("infers textual duration values without misclassifying SLA label text", () => {
    expect(inferFieldType(["83 Hours Passed", "70 Hours Passed"], "Time Elapsed From Submission")).toBe("duration");
    expect(inferFieldType(["Standard: <=5 Business Days", "Platinum: Next Day - 24 to 36 hours"], "Questionnaire SLA (Customer)")).toBe("singleLineText");
  });

  it("suggests merge keys and customer relationship candidates", () => {
    const customerId = field("fld_customer_id", "SecurityPal Customer ID", "singleLineText", { unique: true });
    const plan = buildCsvImportPlan(
      parseCsv("Questionnaire,Client Name,SecurityPal Customer ID,SF ID,Task Status\nQ1,Acme,SP-1,SF-1,Done\nQ2,Acme,SP-1,SF-1,Todo\nQ3,Globex,SP-2,SF-2,Todo"),
      [customerId],
      [],
      { targetMode: "merge", mergeFieldId: customerId.id }
    );

    expect(plan.targetMode).toBe("merge");
    expect(plan.mergeCandidates[0]).toMatchObject({ header: "SecurityPal Customer ID", fieldId: customerId.id });
    expect(plan.selectedMerge).toMatchObject({ header: "SecurityPal Customer ID" });
    expect(plan.relationshipSuggestions[0]).toMatchObject({
      tableName: "Customers",
      keyHeader: "SecurityPal Customer ID",
      uniqueEntities: 2,
    });
  });
});

describe("Airtable migration plan", () => {
  it("orders tables, rows, links, and computed parity checks", () => {
    const plan = planAirtableImport({
      id: "app_1",
      name: "Questionnaire",
      tables: [{
        id: "tbl_tasks",
        name: "Tasks",
        fields: [
          { id: "fld_name", name: "Name", type: "singleLineText" },
          { id: "fld_customer", name: "Customer", type: "multipleRecordLinks" },
          { id: "fld_sla", name: "SLA", type: "formula" },
        ],
        records: [{ id: "rec_airtable_1", fields: { Name: "Task 1" } }],
      }],
    });

    expect(plan.recordIdStrategy).toContain("Preserve Airtable record ids");
    expect(plan.stages.map((stage) => stage.name)).toEqual([
      "create_tables",
      "create_fields",
      "import_records",
      "recreate_links",
      "computed_parity_report",
    ]);
    expect(plan.warnings.length).toBe(2);
  });

  it("counts each Airtable link field for post-record link reconstruction", () => {
    const plan = planAirtableImport({
      name: "Questionnaire",
      tables: [
        {
          id: "tbl_questionnaires",
          name: "Questionnaires",
          fields: [{ id: "fld_tasks", name: "Tasks", type: "multipleRecordLinks" }],
          records: [],
        },
        {
          id: "tbl_tasks",
          name: "Tasks",
          fields: [{ id: "fld_questionnaire", name: "Questionnaire", type: "multipleRecordLinks" }],
          records: [],
        },
      ],
    });

    expect(plan.stages.find((stage) => stage.name === "recreate_links")?.items).toBe(2);
    expect(plan.linkFields.map((field) => field.fieldName)).toEqual(["Tasks", "Questionnaire"]);
  });
});
