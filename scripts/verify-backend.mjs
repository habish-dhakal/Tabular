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

  /* ================================================================ *
   * ADVANCED LOGIC: loops (repeating groups) + conditional groups
   * ================================================================ */
  const LSRC = await mkTable("Loop Src", [{ name: "Item", type: "singleLineText" }]);
  const LOUT = await mkTable("Loop Out", [{ name: "Val", type: "singleLineText" }]);
  const LOUT2 = await mkTable("Loop Out 2", [{ name: "Val", type: "singleLineText" }]);
  const LTRIG = await mkTable("Loop Trig", [{ name: "Go", type: "singleLineText" }]);
  for (const v of ["A", "B", "C"]) {
    await s.req("POST", `/api/tables/${LSRC.tableId}/records`, { cells: { [LSRC.fids.Item]: v } });
  }
  const trigRec = await s.req("POST", `/api/tables/${LTRIG.tableId}/records`, { cells: {} });
  // New tables seed a few blank rows, so scope the loop source to real items.
  const srcCond = [{ id: "src", fieldId: LSRC.fids.Item, op: "isNotEmpty" }];
  const countOut = async (t) => (await s.req("GET", `/api/tables/${t}/records`)).json.records;
  const valsOf = (recs, t) => recs.map((r) => r.cells[t.fids.Val]);

  // Loop over the 3 non-blank Loop-Src records; create one Loop-Out row per
  // item, with the current item's field interpolated via {{item.Item}}.
  const loopAut = await s.req("POST", `/api/tables/${LTRIG.tableId}/automations`, {
    name: "Fan out",
    triggerType: "recordCreated",
    triggerConfig: {},
    actions: [
      {
        kind: "loop",
        config: { source: { kind: "query", tableId: LSRC.tableId, conjunction: "and", conditions: srcCond } },
        actions: [{ type: "createRecord", config: { tableId: LOUT.tableId, cells: { Val: "{{item.Item}}" } } }],
      },
    ],
  });
  check("create looped automation", loopAut.status === 200 && loopAut.json.id, loopAut.json?.error);
  const loopActs = loopAut.json.actions ?? [];
  check("loop node + child persisted (flat=2)", loopActs.length === 2, JSON.stringify(loopActs.map((a) => a.kind)));
  const loopNode = loopActs.find((a) => a.kind === "loop");
  const loopChild = loopActs.find((a) => a.kind === "action");
  check("loop node has null type, child parented to it", !!loopNode && loopNode.type == null && loopChild?.parentId === loopNode.id);

  const loutBefore = (await countOut(LOUT.tableId)).length;
  const loopRun = await s.req("POST", `/api/automations/${loopAut.json.id}/test`, { recordId: trigRec.json.id });
  check("loop run success", loopRun.status === 200 && loopRun.json.status === "success", JSON.stringify(loopRun.json));
  const loutAfter = await countOut(LOUT.tableId);
  check("loop created one row per item (+3)", loutAfter.length - loutBefore === 3, `delta ${loutAfter.length - loutBefore}`);
  check("{{item.*}} interpolated per iteration", ["A", "B", "C"].every((v) => valsOf(loutAfter, LOUT).includes(v)), JSON.stringify(valsOf(loutAfter, LOUT)));

  // Loop + conditional child: only act on the item whose value is "B".
  const condAut = await s.req("POST", `/api/tables/${LTRIG.tableId}/automations`, {
    name: "Fan out if B",
    triggerType: "recordCreated",
    triggerConfig: {},
    actions: [
      {
        kind: "loop",
        config: { source: { kind: "query", tableId: LSRC.tableId, conditions: srcCond } },
        actions: [
          {
            kind: "conditional",
            config: { conjunction: "and", conditions: [{ id: "c1", fieldId: LSRC.fids.Item, op: "is", value: "B" }] },
            actions: [{ type: "createRecord", config: { tableId: LOUT2.tableId, cells: { Val: "{{item.Item}}" } } }],
          },
        ],
      },
    ],
  });
  check("create loop+conditional automation", condAut.status === 200 && condAut.json.id, condAut.json?.error);
  check("nested tree persisted (flat=3)", (condAut.json.actions?.length ?? 0) === 3, JSON.stringify(condAut.json.actions?.map((a) => a.kind)));
  const lout2Before = (await countOut(LOUT2.tableId)).length;
  const condRun = await s.req("POST", `/api/automations/${condAut.json.id}/test`, { recordId: trigRec.json.id });
  check("loop+conditional run success", condRun.status === 200 && condRun.json.status === "success", JSON.stringify(condRun.json));
  const lout2After = await countOut(LOUT2.tableId);
  const newVals = valsOf(lout2After, LOUT2).filter((v) => v === "B");
  check("conditional gates loop body (only B)", lout2After.length - lout2Before === 1 && newVals.length === 1, `delta ${lout2After.length - lout2Before}, B=${newVals.length}`);

  /* ================================================================ *
   * COMMENTS + MENTIONS + NOTIFICATIONS
   * (cross-user mention *delivery* needs member management — not built
   *  yet; here we cover mention filtering, self-exclude, CRUD, isolation) *
   * ================================================================ */
  const CM = await mkTable("Comments", [{ name: "Title", type: "singleLineText" }]);
  const recCM = await s.req("POST", `/api/tables/${CM.tableId}/records`, { cells: {} });

  const membersRes = await s.req("GET", `/api/tables/${CM.tableId}/members`);
  check("members endpoint returns owner", membersRes.status === 200 && (membersRes.json?.length ?? 0) >= 1);
  const me = membersRes.json[0].id;

  const c1 = await s.req("POST", `/api/records/${recCM.json.id}/comments`, {
    body: "hello @self and a ghost", mentions: [me, "usr_nonmember"],
  });
  check("create comment", c1.status === 200 && c1.json.id, c1.json?.error);
  check("comment author resolved to me", c1.json.author?.id === me);
  check("comment body persisted", c1.json.body === "hello @self and a ghost");
  check("non-member mention dropped, member kept", JSON.stringify(c1.json.mentions) === JSON.stringify([me]), JSON.stringify(c1.json.mentions));

  const clist = await s.req("GET", `/api/records/${recCM.json.id}/comments`);
  check("list comments returns the comment", clist.status === 200 && clist.json.length === 1);

  const notif = await s.req("GET", "/api/notifications");
  check("notifications endpoint shape", notif.status === 200 && Array.isArray(notif.json.items) && typeof notif.json.unread === "number");
  check("self-mention creates no notification", notif.json.unread === 0, JSON.stringify(notif.json.unread));
  check("mark all read ok", (await s.req("PATCH", "/api/notifications", { all: true })).status === 200);

  check("delete own comment", (await s.req("DELETE", `/api/comments/${c1.json.id}`)).status === 200);
  check("comment list empty after delete", (await s.req("GET", `/api/records/${recCM.json.id}/comments`)).json.length === 0);

  const cmtIntruder = await login("verify-cmt-intruder@tabular.dev");
  check("intruder GET comments → 404", (await cmtIntruder.req("GET", `/api/records/${recCM.json.id}/comments`)).status === 404);
  check("intruder POST comment → 404", (await cmtIntruder.req("POST", `/api/records/${recCM.json.id}/comments`, { body: "x", mentions: [] })).status === 404);
  check("intruder GET members → 404", (await cmtIntruder.req("GET", `/api/tables/${CM.tableId}/members`)).status === 404);

  /* ================================================================ *
   * MEMBER MANAGEMENT: invites (token) + roles + cross-user delivery
   * ================================================================ */
  const mlist0 = await s.req("GET", `/api/workspaces/${workspaceId}/members`);
  check("members list: owner only to start", mlist0.status === 200 && mlist0.json.length === 1, JSON.stringify(mlist0.json));
  check("owner row flagged isOwner + role owner", mlist0.json[0].isOwner === true && mlist0.json[0].role === "owner");

  const inv = await s.req("POST", `/api/workspaces/${workspaceId}/invites`, { role: "editor" });
  check("create invite", inv.status === 200 && inv.json.id?.startsWith("inv_"), JSON.stringify(inv.json));
  check("invite state pending", inv.json.state === "pending" && inv.json.role === "editor");
  check("invite grants owner rejected", (await s.req("POST", `/api/workspaces/${workspaceId}/invites`, { role: "owner" })).status === 400);
  const token = inv.json.id;

  /* non-members can't manage invites/members */
  const nonMember = await login("verify-invite-intruder@tabular.dev");
  check("non-member list invites → 404", (await nonMember.req("GET", `/api/workspaces/${workspaceId}/invites`)).status === 404);
  check("non-member create invite → 404", (await nonMember.req("POST", `/api/workspaces/${workspaceId}/invites`, { role: "editor" })).status === 404);
  check("non-member list members → 404", (await nonMember.req("GET", `/api/workspaces/${workspaceId}/members`)).status === 404);

  /* invitee previews + accepts the token */
  const invitee = await login("verify-invitee@tabular.dev");
  const preview = await invitee.req("GET", `/api/invites/${token}`);
  check("invitee previews invite", preview.status === 200 && preview.json.role === "editor" && preview.json.state === "pending", JSON.stringify(preview.json));
  const accept = await invitee.req("POST", `/api/invites/${token}/accept`);
  check("invitee accepts invite", accept.status === 200 && accept.json.alreadyMember === false, JSON.stringify(accept.json));
  check("re-accepting used invite → 410", (await invitee.req("POST", `/api/invites/${token}/accept`)).status === 410);

  const mlist1 = await s.req("GET", `/api/workspaces/${workspaceId}/members`);
  check("members list now has 2", mlist1.status === 200 && mlist1.json.length === 2, JSON.stringify(mlist1.json));
  const inviteeRow = mlist1.json.find((m) => m.email === "verify-invitee@tabular.dev");
  check("invitee joined as editor", inviteeRow?.role === "editor" && inviteeRow?.isOwner === false);
  const inviteeId = inviteeRow.id;
  check("invitee now has workspace access", (await invitee.req("GET", `/api/workspaces/${workspaceId}/members`)).status === 200);

  /* CROSS-USER MENTION DELIVERY (the previously-untested path) */
  const cxc = await s.req("POST", `/api/records/${recCM.json.id}/comments`, { body: "ping @editor", mentions: [inviteeId] });
  check("owner mentions the invitee", cxc.status === 200 && JSON.stringify(cxc.json.mentions) === JSON.stringify([inviteeId]), JSON.stringify(cxc.json?.mentions));
  const invNotif = await invitee.req("GET", "/api/notifications");
  check("cross-user mention delivered to invitee", invNotif.status === 200 && invNotif.json.unread >= 1, JSON.stringify(invNotif.json));
  check("delivered notification is a mention on the record", invNotif.json.items.some((n) => n.type === "mention" && n.recordId === recCM.json.id && n.body === "ping @editor"));

  /* role management + guards */
  check("owner demotes invitee to viewer", (await s.req("PATCH", `/api/workspaces/${workspaceId}/members/${inviteeId}`, { role: "viewer" })).status === 200);
  check("promote to owner rejected", (await s.req("PATCH", `/api/workspaces/${workspaceId}/members/${inviteeId}`, { role: "owner" })).status === 400);
  check("changing owner's own role rejected", (await s.req("PATCH", `/api/workspaces/${workspaceId}/members/${me}`, { role: "editor" })).status === 400);
  check("removing the owner rejected", (await s.req("DELETE", `/api/workspaces/${workspaceId}/members/${me}`)).status === 400);
  check("viewer cannot manage members", (await invitee.req("PATCH", `/api/workspaces/${workspaceId}/members/${me}`, { role: "viewer" })).status === 403);

  /* remove the member */
  check("owner removes invitee", (await s.req("DELETE", `/api/workspaces/${workspaceId}/members/${inviteeId}`)).status === 200);
  check("members list back to 1", (await s.req("GET", `/api/workspaces/${workspaceId}/members`)).json.length === 1);
  check("removed member loses workspace access", (await invitee.req("GET", `/api/workspaces/${workspaceId}/members`)).status === 404);

  /* revoke + email-pin */
  const inv2 = await s.req("POST", `/api/workspaces/${workspaceId}/invites`, { role: "editor" });
  check("revoke invite", (await s.req("DELETE", `/api/workspaces/${workspaceId}/invites/${inv2.json.id}`)).status === 200);
  check("accepting revoked invite → 404", (await invitee.req("POST", `/api/invites/${inv2.json.id}/accept`)).status === 404);
  const invPinned = await s.req("POST", `/api/workspaces/${workspaceId}/invites`, { role: "editor", email: "someone-else@tabular.dev" });
  check("email-pinned invite rejects wrong user", (await invitee.req("POST", `/api/invites/${invPinned.json.id}/accept`)).status === 403);

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
