/**
 * Backend API verification suite.
 * Exercises auth, workspaces, bases, tables, fields, records, views, access
 * control, validation, and computed-field coercion against a running server.
 *
 * Usage:  node scripts/verify-backend.mjs [baseURL]
 * Requires the dev/prod server running (default http://localhost:3100).
 * Creates an isolated base under verify@tabular.dev and deletes it at the end.
 */

const B = process.argv[2] || process.env.BASE_URL || "http://localhost:3100";

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) { pass++; }
  else { failures.push(name + (detail ? ` — ${detail}` : "")); console.log("  ✗", name, detail ?? ""); }
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

  /* ---- record delete ---- */
  check("delete record", (await s.req("DELETE", `/api/records/${recId}`)).status === 200);

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
    process.exit(1);
  }
  console.log("✓ All backend checks passed");
}

main().catch((e) => { console.error("Harness error:", e); process.exit(2); });
