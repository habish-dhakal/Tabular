/**
 * Backend API verification suite.
 * Exercises auth, workspaces, bases, tables, fields, records, views, access
 * control, validation, and computed-field coercion against a running server.
 *
 * Usage:  node scripts/verify-backend.mjs [baseURL]
 * Requires the dev/prod server running (default http://localhost:3100).
 * Creates an isolated base under verify@tabular.dev and deletes it at the end.
 */

import { spawn } from "node:child_process";

const B = process.argv[2] || process.env.BASE_URL || "http://localhost:3100";

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) { pass++; }
  else { failures.push(name + (detail ? ` — ${detail}` : "")); console.log("  ✗", name, detail ?? ""); }
}

/* -------- automation worker (spawned with stubbed senders) -------- */
let worker = null;
function startWorker() {
  return new Promise((resolve, reject) => {
    const w = spawn("npm", ["run", "worker"], {
      env: { ...process.env, AUTOMATIONS_STUB: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    const timer = setTimeout(() => reject(new Error("worker did not become ready:\n" + out)), 20000);
    const onData = (d) => {
      out += d.toString();
      if (out.includes("[worker] ready")) { clearTimeout(timer); worker = w; resolve(w); }
    };
    w.stdout.on("data", onData);
    w.stderr.on("data", (d) => { out += d.toString(); });
    w.on("exit", (code) => { if (!worker) { clearTimeout(timer); reject(new Error(`worker exited early (${code}):\n` + out)); } });
  });
}
function killWorker() {
  if (worker) { worker.kill("SIGTERM"); worker = null; }
}

/** Poll `fn` until it returns truthy or the timeout elapses. */
async function waitFor(fn, timeout = 6000, interval = 150) {
  const start = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - start > timeout) return null;
    await new Promise((r) => setTimeout(r, interval));
  }
}

/* -------- tiny cookie-jar fetch wrapper -------- */
function makeSession() {
  const jar = new Map();
  const cookieHeader = () => [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  function absorb(res) {
    const raw = res.headers.getSetCookie?.() ?? [];
    for (const c of raw) {
      const [pair] = c.split(";");
      const idx = pair.indexOf("=");
      jar.set(pair.slice(0, idx), pair.slice(idx + 1));
    }
  }
  async function req(method, path, body) {
    const res = await fetch(B + path, {
      method,
      headers: { "content-type": "application/json", cookie: cookieHeader() },
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: "manual",
    });
    absorb(res);
    let json = null;
    try { json = await res.json(); } catch { /* no body */ }
    return { status: res.status, json };
  }
  return { req, jar, cookieHeader, absorb };
}

async function login(email) {
  const s = makeSession();
  const csrfRes = await fetch(B + "/api/auth/csrf", { headers: { cookie: s.cookieHeader() } });
  s.absorb(csrfRes);
  const { csrfToken } = await csrfRes.json();
  const form = new URLSearchParams({ csrfToken, email, json: "true" });
  const res = await fetch(B + "/api/auth/callback/dev", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", cookie: s.cookieHeader() },
    body: form.toString(),
    redirect: "manual",
  });
  s.absorb(res);
  return s;
}

async function main() {
  console.log(`Backend verification → ${B}\n`);

  /* ---- auth guard ---- */
  const anon = makeSession();
  check("unauth GET /api/workspaces → 401", (await anon.req("GET", "/api/workspaces")).status === 401);

  /* ---- login + self-heal workspace ---- */
  const s = await login("verify@tabular.dev");
  const ws = await s.req("GET", "/api/workspaces");
  check("authed workspaces list ok", ws.status === 200 && Array.isArray(ws.json.workspaces));
  check("self-heal: has >=1 workspace", (ws.json.workspaces?.length ?? 0) >= 1);
  const workspaceId = ws.json.workspaces[0].id;

  /* ---- spawn automation worker (stubbed senders) ---- */
  await startWorker();
  check("automation worker ready", !!worker);

  /* ---- base create ---- */
  const baseRes = await s.req("POST", `/api/workspaces/${workspaceId}/bases`, { name: "Verify Base" });
  check("create base", baseRes.status === 200 && baseRes.json.id);
  const baseId = baseRes.json.id;

  /* ---- table create with defaults ---- */
  const tRes = await s.req("POST", `/api/bases/${baseId}/tables`, { name: "T" });
  check("create table", tRes.status === 200 && tRes.json.table?.id);
  const tableId = tRes.json.table.id;

  const bundle = await s.req("GET", `/api/tables/${tableId}`);
  check("table bundle has default fields", (bundle.json.fields?.length ?? 0) >= 3);
  check("table bundle has a grid view", bundle.json.views?.some((v) => v.type === "grid"));
  const primary = bundle.json.fields.find((f) => f.isPrimary);
  check("has a primary field", !!primary);

  /* ---- field creation for each editable type ---- */
  const types = [
    ["singleLineText", {}], ["longText", {}], ["number", {}], ["currency", {}],
    ["percent", {}], ["checkbox", {}], ["date", {}], ["dateTime", {}],
    ["url", {}], ["email", {}], ["phone", {}], ["rating", {}],
    ["singleSelect", { choices: [{ id: "a", name: "A", color: "#f00" }] }],
    ["multiSelect", { choices: [{ id: "x", name: "X", color: "#0f0" }] }],
    ["formula", { expression: "1 + 2" }],
  ];
  const fieldIds = {};
  for (const [type, options] of types) {
    const r = await s.req("POST", `/api/tables/${tableId}/fields`, { name: `f_${type}`, type, options });
    check(`create field ${type}`, r.status === 200 && r.json.id, r.json?.error);
    if (r.json?.id) fieldIds[type] = r.json.id;
  }

  /* ---- record create + cell writes/validation ---- */
  const recRes = await s.req("POST", `/api/tables/${tableId}/records`, { cells: {} });
  check("create record", recRes.status === 200 && recRes.json.id);
  const recId = recRes.json.id;

  const wr = await s.req("PATCH", `/api/records/${recId}`, {
    cells: { [fieldIds.singleLineText]: "hello", [fieldIds.number]: 42, [fieldIds.checkbox]: true },
  });
  check("write text/number/checkbox", wr.status === 200 && wr.json.cells[fieldIds.number] === 42);

  check("invalid number rejected",
    (await s.req("PATCH", `/api/records/${recId}`, { cells: { [fieldIds.number]: "abc" } })).status === 400);
  check("unknown select choice rejected",
    (await s.req("PATCH", `/api/records/${recId}`, { cells: { [fieldIds.singleSelect]: "nope" } })).status === 400);
  check("valid select accepted",
    (await s.req("PATCH", `/api/records/${recId}`, { cells: { [fieldIds.singleSelect]: "a" } })).status === 200);
  const dateWr = await s.req("PATCH", `/api/records/${recId}`, { cells: { [fieldIds.date]: "2026-03-15" } });
  check("date-only stored", dateWr.json?.cells?.[fieldIds.date] === "2026-03-15");
  check("write to formula (computed) rejected",
    (await s.req("PATCH", `/api/records/${recId}`, { cells: { [fieldIds.formula]: "x" } })).status === 400);

  /* ---- field update: rename + type change coercion ---- */
  const ren = await s.req("PATCH", `/api/fields/${fieldIds.phone}`, { name: "Phone2" });
  check("rename field", ren.status === 200 && ren.json.name === "Phone2");
  // number(42) -> singleLineText should coerce to "42"
  await s.req("PATCH", `/api/fields/${fieldIds.number}`, { type: "singleLineText" });
  const afterCoerce = await s.req("GET", `/api/tables/${tableId}/records`);
  const r0 = afterCoerce.json.records.find((r) => r.id === recId);
  check("type change coerces 42 → '42'", r0.cells[fieldIds.number] === "42");

  /* ---- field reorder ---- */
  const order = bundle.json.fields.map((f) => f.id).reverse();
  const reorder = await s.req("POST", `/api/tables/${tableId}/fields/reorder`, { order });
  check("reorder fields", reorder.status === 200);

  /* ---- primary field cannot be deleted ---- */
  check("cannot delete primary field",
    (await s.req("DELETE", `/api/fields/${primary.id}`)).status === 400);
  check("delete a normal field",
    (await s.req("DELETE", `/api/fields/${fieldIds.rating}`)).status === 200);

  /* ---- views ---- */
  for (const type of ["kanban", "calendar", "gallery"]) {
    const v = await s.req("POST", `/api/tables/${tableId}/views`, { name: `${type} v`, type });
    check(`create ${type} view`, v.status === 200 && v.json.id);
  }
  const viewsList = (await s.req("GET", `/api/tables/${tableId}`)).json.views;
  const gridView = viewsList.find((v) => v.type === "grid");
  const cfg = { filters: { conjunction: "and", conditions: [{ id: "c1", fieldId: fieldIds.checkbox, op: "is", value: true }] }, sorts: [{ fieldId: primary.id, direction: "asc" }], groupBy: fieldIds.singleSelect };
  const savedCfg = await s.req("PATCH", `/api/views/${gridView.id}`, { config: cfg });
  check("save view config", savedCfg.status === 200 && savedCfg.json.config?.groupBy === fieldIds.singleSelect);
  const reload = (await s.req("GET", `/api/tables/${tableId}`)).json.views.find((v) => v.id === gridView.id);
  check("view config persisted", reload.config?.filters?.conditions?.length === 1);
  // deleting last view forbidden: delete all but one
  const delViews = viewsList.filter((v) => v.id !== gridView.id);
  for (const v of delViews) await s.req("DELETE", `/api/views/${v.id}`);
  check("cannot delete the last view",
    (await s.req("DELETE", `/api/views/${gridView.id}`)).status === 400);

  /* ---- linked records ---- */
  const t2 = await s.req("POST", `/api/bases/${baseId}/tables`, { name: "T2" });
  const t2Id = t2.json.table.id;
  const t2Primary = (await s.req("GET", `/api/tables/${t2Id}`)).json.fields.find((f) => f.isPrimary);
  // owner link field on T → T2 (multiple)
  const linkRes = await s.req("POST", `/api/tables/${tableId}/fields`, { name: "Links", type: "link", options: { linkedTableId: t2Id, allowMultiple: true } });
  check("create link field", linkRes.status === 200 && linkRes.json.type === "link", linkRes.json?.error);
  const linkFieldId = linkRes.json.id;
  const relId = linkRes.json.options.relationshipId;
  check("owner has relationshipId + symmetricFieldId", !!relId && !!linkRes.json.options.symmetricFieldId);
  // reverse field auto-created on T2
  const t2fields = (await s.req("GET", `/api/tables/${t2Id}`)).json.fields;
  const reverseField = t2fields.find((f) => f.type === "link" && f.options.reverse === true);
  check("symmetric reverse field created on T2", !!reverseField && reverseField.options.linkedTableId === tableId);

  // two records in T2 + one in T
  const r2a = await s.req("POST", `/api/tables/${t2Id}/records`, { cells: { [t2Primary.id]: "Alpha" } });
  const r2b = await s.req("POST", `/api/tables/${t2Id}/records`, { cells: { [t2Primary.id]: "Beta" } });
  const r1 = await s.req("POST", `/api/tables/${tableId}/records`, { cells: {} });

  // set links r1 → [r2a, r2b]
  const setRes = await s.req("PUT", `/api/records/${r1.json.id}/links`, { fieldId: linkFieldId, targetIds: [r2a.json.id, r2b.json.id] });
  check("set links", setRes.status === 200);
  const tRecs = (await s.req("GET", `/api/tables/${tableId}/records`)).json.records;
  const r1Now = tRecs.find((r) => r.id === r1.json.id);
  const chips = r1Now?.cells[linkFieldId] ?? [];
  check("owner cell resolves 2 link chips", chips.length === 2, JSON.stringify(chips));
  check("chip labels resolved", chips.some((c) => c.label === "Alpha") && chips.some((c) => c.label === "Beta"));

  // symmetric: r2a should show r1 on its reverse field
  const t2Recs = (await s.req("GET", `/api/tables/${t2Id}/records`)).json.records;
  const r2aNow = t2Recs.find((r) => r.id === r2a.json.id);
  check("symmetric reverse resolves back to r1", (r2aNow?.cells[reverseField.id] ?? []).some((c) => c.id === r1.json.id));

  /* ---- lookup + rollup over the link ---- */
  const scoreF = await s.req("POST", `/api/tables/${t2Id}/fields`, { name: "Score", type: "number" });
  await s.req("PATCH", `/api/records/${r2a.json.id}`, { cells: { [scoreF.json.id]: 10 } });
  await s.req("PATCH", `/api/records/${r2b.json.id}`, { cells: { [scoreF.json.id]: 5 } });

  const lookupF = await s.req("POST", `/api/tables/${tableId}/fields`, { name: "Names", type: "lookup", options: { linkFieldId, targetFieldId: t2Primary.id } });
  const rollup = async (name, fn) => (await s.req("POST", `/api/tables/${tableId}/fields`, { name, type: "rollup", options: { linkFieldId, targetFieldId: scoreF.json.id, fn } })).json;
  const sumF = await rollup("TotalScore", "SUM");
  const countF = await rollup("N", "COUNT");
  const avgF = await rollup("AvgScore", "AVERAGE");
  const minF = await rollup("MinScore", "MIN");
  const maxF = await rollup("MaxScore", "MAX");
  const concatF = await rollup("AllScores", "CONCAT");
  check("create lookup field", lookupF.status === 200, lookupF.json?.error);
  check("create rollup field", !!sumF.id);

  const enriched = (await s.req("GET", `/api/tables/${tableId}/records`)).json.records.find((r) => r.id === r1.json.id);
  const lookupVals = enriched?.cells[lookupF.json.id] ?? [];
  check("lookup pulls linked names", lookupVals.includes("Alpha") && lookupVals.includes("Beta"), JSON.stringify(lookupVals));
  check("rollup SUM = 15", enriched?.cells[sumF.id] === 15, JSON.stringify(enriched?.cells[sumF.id]));
  check("rollup COUNT = 2", enriched?.cells[countF.id] === 2, JSON.stringify(enriched?.cells[countF.id]));
  check("rollup AVERAGE = 7.5", enriched?.cells[avgF.id] === 7.5, JSON.stringify(enriched?.cells[avgF.id]));
  check("rollup MIN = 5", enriched?.cells[minF.id] === 5, JSON.stringify(enriched?.cells[minF.id]));
  check("rollup MAX = 10", enriched?.cells[maxF.id] === 10, JSON.stringify(enriched?.cells[maxF.id]));
  check("rollup CONCAT = '10, 5'", enriched?.cells[concatF.id] === "10, 5", JSON.stringify(enriched?.cells[concatF.id]));

  // single-link field caps at 1
  const singleLink = await s.req("POST", `/api/tables/${tableId}/fields`, { name: "OneLink", type: "link", options: { linkedTableId: t2Id, allowMultiple: false } });
  await s.req("PUT", `/api/records/${r1.json.id}/links`, { fieldId: singleLink.json.id, targetIds: [r2a.json.id, r2b.json.id] });
  const capped = (await s.req("GET", `/api/tables/${tableId}/records`)).json.records.find((r) => r.id === r1.json.id);
  check("single-link caps at 1 target", (capped?.cells[singleLink.json.id] ?? []).length === 1);

  // deleting the link field removes its reverse partner
  check("delete link field", (await s.req("DELETE", `/api/fields/${linkFieldId}`)).status === 200);
  const t2fieldsAfter = (await s.req("GET", `/api/tables/${t2Id}`)).json.fields;
  check("reverse field removed with owner", !t2fieldsAfter.some((f) => f.id === reverseField.id));

  /* ---- record delete ---- */
  check("delete record", (await s.req("DELETE", `/api/records/${recId}`)).status === 200);

  /* ================================================================ *
   * AUTOMATIONS
   * ================================================================ */
  // Helper: fresh table with named fields so events don't cross-fire and
  // {{tokens}} resolve by a known name.
  async function mkTable(name, fieldDefs) {
    const t = await s.req("POST", `/api/bases/${baseId}/tables`, { name });
    const tid = t.json.table.id;
    const fids = {};
    for (const fd of fieldDefs) {
      const r = await s.req("POST", `/api/tables/${tid}/fields`, fd);
      fids[fd.name] = r.json.id;
    }
    return { tableId: tid, fids };
  }
  const runsOf = async (autId) => (await s.req("GET", `/api/automations/${autId}/runs`)).json ?? [];
  const runCount = async (autId) => (await runsOf(autId)).length;

  /* ---- CRUD + recordCreated fires with interpolated payload ---- */
  // Use a field name that doesn't collide with the default primary ("Name"),
  // so token resolution is unambiguous.
  const A = await mkTable("Auto A", [
    { name: "Task", type: "singleLineText" },
    { name: "Score", type: "number" },
  ]);
  const createAut = await s.req("POST", `/api/tables/${A.tableId}/automations`, {
    name: "Welcome",
    triggerType: "recordCreated",
    triggerConfig: {},
    actions: [
      { type: "sendEmail", config: { to: "a@b.com", subject: "Hi {{Task}}", body: "Score {{Score}}" } },
    ],
  });
  check("create automation", createAut.status === 200 && createAut.json.id, createAut.json?.error);
  check("automation returns its actions", (createAut.json.actions?.length ?? 0) === 1);
  const autA = createAut.json.id;

  const listAut = await s.req("GET", `/api/tables/${A.tableId}/automations`);
  check("list automations", listAut.status === 200 && listAut.json.length === 1);

  const recA = await s.req("POST", `/api/tables/${A.tableId}/records`, {
    cells: { [A.fids.Task]: "Zed", [A.fids.Score]: 7 },
  });
  const firedA = await waitFor(async () => (await runsOf(autA)).find((r) => r.status === "success"));
  check("recordCreated automation fired", !!firedA);
  const stepA = firedA?.steps?.[0];
  check("step logged for sendEmail", stepA?.type === "sendEmail" && stepA?.status === "success");
  check("token {{Task}} interpolated", stepA?.input?.subject === "Hi Zed", JSON.stringify(stepA?.input));
  check("token {{Score}} interpolated", stepA?.input?.body === "Score 7", JSON.stringify(stepA?.input));
  check("stub sender captured payload", stepA?.output?.stubbed === true);

  /* ---- recordUpdated watch:"fields" fires only on the watched field ---- */
  const U = await mkTable("Auto U", [
    { name: "Title", type: "singleLineText" },
    { name: "Done", type: "checkbox" },
  ]);
  const recU = await s.req("POST", `/api/tables/${U.tableId}/records`, { cells: {} });
  const autU = (await s.req("POST", `/api/tables/${U.tableId}/automations`, {
    name: "Watch Done",
    triggerType: "recordUpdated",
    triggerConfig: { watch: "fields", fieldIds: [U.fids.Done] },
    actions: [{ type: "httpRequest", config: { method: "POST", url: "https://example.com/hook", body: "{{Title}}" } }],
  })).json.id;
  // Update an unwatched field → must NOT fire.
  await s.req("PATCH", `/api/records/${recU.json.id}`, { cells: { [U.fids.Title]: "hello" } });
  await new Promise((r) => setTimeout(r, 1200));
  check("watch:fields ignores unwatched change", (await runCount(autU)) === 0);
  // Update the watched field → fires.
  await s.req("PATCH", `/api/records/${recU.json.id}`, { cells: { [U.fids.Done]: true } });
  const firedU = await waitFor(async () => (await runCount(autU)) === 1);
  check("watch:fields fires on watched change", !!firedU);

  /* ---- recordMatchesCondition ---- */
  const C = await mkTable("Auto C", [{ name: "Status", type: "singleLineText" }]);
  const recC = await s.req("POST", `/api/tables/${C.tableId}/records`, { cells: {} });
  const autC = (await s.req("POST", `/api/tables/${C.tableId}/automations`, {
    name: "On Active",
    triggerType: "recordMatchesCondition",
    triggerConfig: { conjunction: "and", conditions: [{ id: "c1", fieldId: C.fids.Status, op: "is", value: "active" }] },
    actions: [{ type: "sendSlack", config: { channel: "#g", text: "now {{Status}}" } }],
  })).json.id;
  await s.req("PATCH", `/api/records/${recC.json.id}`, { cells: { [C.fids.Status]: "idle" } });
  await new Promise((r) => setTimeout(r, 1000));
  check("condition not met → no run", (await runCount(autC)) === 0);
  await s.req("PATCH", `/api/records/${recC.json.id}`, { cells: { [C.fids.Status]: "active" } });
  check("matchesCondition fires when met", !!(await waitFor(async () => (await runCount(autC)) >= 1)));

  /* ---- recordEntersCondition (phase change, fires once) ---- */
  const E = await mkTable("Auto E", [{ name: "Score", type: "number" }]);
  const recE = await s.req("POST", `/api/tables/${E.tableId}/records`, { cells: { [E.fids.Score]: 5 } });
  const autE = (await s.req("POST", `/api/tables/${E.tableId}/automations`, {
    name: "Crossed 10",
    triggerType: "recordEntersCondition",
    triggerConfig: { conjunction: "and", conditions: [{ id: "c1", fieldId: E.fids.Score, op: "gt", value: 10 }] },
    actions: [{ type: "httpRequest", config: { method: "POST", url: "https://example.com/enter" } }],
  })).json.id;
  await s.req("PATCH", `/api/records/${recE.json.id}`, { cells: { [E.fids.Score]: 20 } }); // enters
  check("entersCondition fires on entry", !!(await waitFor(async () => (await runCount(autE)) === 1)));
  await s.req("PATCH", `/api/records/${recE.json.id}`, { cells: { [E.fids.Score]: 25 } }); // still matches
  await new Promise((r) => setTimeout(r, 1200));
  check("entersCondition does not re-fire while still matching", (await runCount(autE)) === 1);

  /* ---- recordDeleted trigger ---- */
  const D = await mkTable("Auto D", [{ name: "Title", type: "singleLineText" }]);
  const recD = await s.req("POST", `/api/tables/${D.tableId}/records`, { cells: { [D.fids.Title]: "bye" } });
  const autD = (await s.req("POST", `/api/tables/${D.tableId}/automations`, {
    name: "On delete",
    triggerType: "recordDeleted",
    triggerConfig: {},
    actions: [{ type: "httpRequest", config: { method: "POST", url: "https://example.com/deleted" } }],
  })).json.id;
  await s.req("DELETE", `/api/records/${recD.json.id}`);
  check("recordDeleted trigger fires", !!(await waitFor(async () => (await runCount(autD)) === 1)));

  /* ---- loop guard: updateRecord action doesn't infinitely re-fire ---- */
  const L = await mkTable("Auto L", [
    { name: "Counter", type: "number" },
    { name: "Touched", type: "singleLineText" },
  ]);
  const recL = await s.req("POST", `/api/tables/${L.tableId}/records`, { cells: { [L.fids.Counter]: 0 } });
  const autL = (await s.req("POST", `/api/tables/${L.tableId}/automations`, {
    name: "Self write",
    triggerType: "recordUpdated",
    triggerConfig: { watch: "all" },
    actions: [{ type: "updateRecord", config: { recordId: recL.json.id, cells: { Touched: "yes" } } }],
  })).json.id;
  await s.req("PATCH", `/api/records/${recL.json.id}`, { cells: { [L.fids.Counter]: 1 } });
  await new Promise((r) => setTimeout(r, 1500));
  const loopRuns = await runCount(autL);
  check("loop guard: self-write does not runaway", loopRuns === 1, `runs=${loopRuns}`);

  /* ---- action: createRecord (runs the real records service inline) ----
     Target a separate table with no automations so the created row can't
     re-trigger anything (recordCreated + createRecord on the same table would
     loop until the depth guard — correct behaviour, but non-deterministic here). */
  const CT = await mkTable("Create Target", [{ name: "Task", type: "singleLineText" }]);
  const autCreate = (await s.req("POST", `/api/tables/${A.tableId}/automations`, {
    name: "Spawn row",
    triggerType: "recordCreated",
    triggerConfig: {},
    actions: [{ type: "createRecord", config: { tableId: CT.tableId, cells: { Task: "Made by {{Task}}" } } }],
  })).json.id;
  const ctBefore = (await s.req("GET", `/api/tables/${CT.tableId}/records`)).json.records.length;
  const crRun = await s.req("POST", `/api/automations/${autCreate}/test`, { recordId: recA.json.id });
  check("createRecord action run success", crRun.status === 200 && crRun.json.status === "success", JSON.stringify(crRun.json));
  const ctRecs = (await s.req("GET", `/api/tables/${CT.tableId}/records`)).json.records;
  check("createRecord action inserted a row", ctRecs.length === ctBefore + 1);
  check("createRecord row has interpolated cell", ctRecs.some((r) => r.cells[CT.fids.Task] === "Made by Zed"), JSON.stringify(ctRecs.map((r) => r.cells)));

  /* ---- action: appendGoogleSheet (stubbed sender, tokens interpolated) ---- */
  const autSheet = (await s.req("POST", `/api/tables/${A.tableId}/automations`, {
    name: "Log to sheet",
    triggerType: "recordCreated",
    triggerConfig: {},
    actions: [{ type: "appendGoogleSheet", config: { spreadsheetId: "ss_1", values: ["{{Task}}", "{{Score}}"] } }],
  })).json.id;
  await s.req("POST", `/api/automations/${autSheet}/test`, { recordId: recA.json.id });
  const sheetRun = (await runsOf(autSheet))[0];
  const sheetStep = sheetRun?.steps?.[0];
  check("appendGoogleSheet run success", sheetRun?.status === "success", JSON.stringify(sheetRun));
  check("sheet values interpolated", JSON.stringify(sheetStep?.input?.values) === JSON.stringify(["Zed", "7"]), JSON.stringify(sheetStep?.input));
  check("sheet sender stubbed", sheetStep?.output?.stubbed === true);

  /* ---- test-run route (inline, stubbed) ---- */
  const testRun = await s.req("POST", `/api/automations/${autA}/test`, { recordId: recA.json.id });
  check("test-run returns success", testRun.status === 200 && testRun.json.status === "success", JSON.stringify(testRun.json));

  /* ---- update (toggle enabled + replace actions) + delete ---- */
  const patched = await s.req("PATCH", `/api/automations/${autA}`, { enabled: false, actions: [] });
  check("patch automation (disable + clear actions)", patched.status === 200 && patched.json.enabled === false && patched.json.actions.length === 0);
  check("delete automation", (await s.req("DELETE", `/api/automations/${autU}`)).status === 200);
  check("deleted automation is gone", (await s.req("GET", `/api/automations/${autU}`)).status === 404);

  /* ---- tenant isolation on automation routes ---- */
  const autIntruder = await login("verify-intruder@tabular.dev");
  check("intruder list automations → 404", (await autIntruder.req("GET", `/api/tables/${A.tableId}/automations`)).status === 404);
  check("intruder GET automation → 404", (await autIntruder.req("GET", `/api/automations/${autA}`)).status === 404);
  check("intruder create automation → 404",
    (await autIntruder.req("POST", `/api/tables/${A.tableId}/automations`, { name: "x", triggerType: "recordCreated", actions: [] })).status === 404);

  /* ---- tenant isolation ---- */
  const intruder = await login("verify-intruder@tabular.dev");
  check("intruder GET base tables → 404", (await intruder.req("GET", `/api/bases/${baseId}/tables`)).status === 404);
  check("intruder GET table bundle → 404", (await intruder.req("GET", `/api/tables/${tableId}`)).status === 404);
  check("intruder POST record → 404", (await intruder.req("POST", `/api/tables/${tableId}/records`, { cells: {} })).status === 404);
  check("intruder DELETE base → 404", (await intruder.req("DELETE", `/api/bases/${baseId}`)).status === 404);

  /* ---- cleanup ---- */
  check("delete base (cleanup)", (await s.req("DELETE", `/api/bases/${baseId}`)).status === 200);

  /* ---- report ---- */
  console.log(`\n${pass} passed, ${failures.length} failed`);
  if (failures.length) {
    console.log("\nFailures:");
    failures.forEach((f) => console.log("  -", f));
    killWorker();
    process.exit(1);
  }
  console.log("✓ All backend checks passed");
  killWorker();
}

main().catch((e) => { console.error("Harness error:", e); killWorker(); process.exit(2); });
