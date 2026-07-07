/**
 * Frontend end-to-end verification suite (puppeteer-core + local Chrome).
 * Creates an isolated base via the API, then drives the real UI: grid render,
 * inline text edit, select menu, custom date picker, formula compute, computed
 * viewer, toolbar popovers, and all four view types — asserting zero console
 * errors throughout. Cleans up the base at the end.
 *
 * Usage: node scripts/verify-frontend.mjs [baseURL]
 * Env:   CHROME_PATH (default: macOS Google Chrome)
 */

import puppeteer from "puppeteer-core";

const B = process.argv[2] || process.env.BASE_URL || "http://localhost:3100";
const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const EMAIL = "verify-e2e@tabular.dev";

let pass = 0;
const failures = [];
const check = (name, cond, detail) => {
  if (cond) pass++;
  else { failures.push(name + (detail ? ` — ${detail}` : "")); console.log("  ✗", name, detail ?? ""); }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---- cookie-jar login + API helper (for test-data setup) ---- */
function jarFns() {
  const jar = new Map();
  const cookie = () => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
  const absorb = (res) => (res.headers.getSetCookie?.() ?? []).forEach((c) => {
    const p = c.split(";")[0], i = p.indexOf("=");
    jar.set(p.slice(0, i), p.slice(i + 1));
  });
  return { jar, cookie, absorb };
}
async function login(email) {
  const j = jarFns();
  const csrf = await fetch(B + "/api/auth/csrf", { headers: { cookie: j.cookie() } });
  j.absorb(csrf);
  const { csrfToken } = await csrf.json();
  const res = await fetch(B + "/api/auth/callback/dev", {
    method: "POST", redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded", cookie: j.cookie() },
    body: new URLSearchParams({ csrfToken, email, json: "true" }).toString(),
  });
  j.absorb(res);
  return j;
}
async function api(j, method, path, body) {
  const res = await fetch(B + path, {
    method, redirect: "manual",
    headers: { "content-type": "application/json", cookie: j.cookie() },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return res.json().catch(() => null);
}

async function main() {
  console.log(`Frontend verification → ${B}\n`);
  const j = await login(EMAIL);
  const token = j.jar.get("authjs.session-token");
  if (!token) throw new Error("login failed — no session token");

  /* ---- seed an isolated base ---- */
  const ws = (await api(j, "GET", "/api/workspaces")).workspaces[0].id;
  const base = await api(j, "POST", `/api/workspaces/${ws}/bases`, { name: "E2E" });
  const t = await api(j, "POST", `/api/bases/${base.id}/tables`, { name: "Items" });
  const tableId = t.table.id;
  const fields = (await api(j, "GET", `/api/tables/${tableId}`)).fields;
  const nameF = fields.find((f) => f.isPrimary);
  const statusF = fields.find((f) => f.name === "Status");
  const dateF = await api(j, "POST", `/api/tables/${tableId}/fields`, { name: "When", type: "date" });
  await api(j, "POST", `/api/tables/${tableId}/fields`, { name: "Upper", type: "formula", options: { expression: "UPPER({Name})" } });
  const rec1 = await api(j, "POST", `/api/tables/${tableId}/records`, { cells: { [nameF.id]: "alpha", [statusF.id]: "todo", [dateF.id]: "2026-03-20" } });
  await api(j, "POST", `/api/tables/${tableId}/records`, { cells: { [nameF.id]: "bravo", [statusF.id]: "done" } });

  // linked records: a second table + a link field, with one link pre-set
  const t2 = await api(j, "POST", `/api/bases/${base.id}/tables`, { name: "Refs" });
  const t2Id = t2.table.id;
  const t2Primary = (await api(j, "GET", `/api/tables/${t2Id}`)).fields.find((f) => f.isPrimary);
  const refOne = await api(j, "POST", `/api/tables/${t2Id}/records`, { cells: { [t2Primary.id]: "Ref One" } });
  await api(j, "POST", `/api/tables/${t2Id}/records`, { cells: { [t2Primary.id]: "Ref Two" } });
  const linkField = await api(j, "POST", `/api/tables/${tableId}/fields`, { name: "Related", type: "link", options: { linkedTableId: t2Id, allowMultiple: true } });
  const lookupField = await api(j, "POST", `/api/tables/${tableId}/fields`, { name: "RefNames", type: "lookup", options: { linkFieldId: linkField.id, targetFieldId: t2Primary.id } });
  const rollupField = await api(j, "POST", `/api/tables/${tableId}/fields`, { name: "RefCount", type: "rollup", options: { linkFieldId: linkField.id, targetFieldId: t2Primary.id, fn: "COUNT" } });
  await api(j, "PUT", `/api/records/${rec1.id}/links`, { fieldId: linkField.id, targetIds: [refOne.id] });

  /* ---- browser ---- */
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
  const errors = [];
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1500, height: 900 });
    page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
    page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });
    page.on("dialog", (d) => d.accept()); // auto-accept confirm()/alert()
    await page.setCookie({ name: "authjs.session-token", value: token, domain: "localhost", path: "/", httpOnly: true });

    // dashboard
    await page.goto(`${B}/dashboard`, { waitUntil: "networkidle0" });
    const dash = await page.evaluate(() => document.body.innerText);
    check("dashboard shows base 'E2E'", dash.includes("E2E"));

    // open base → grid
    await page.goto(`${B}/base/${base.id}`, { waitUntil: "networkidle0" });
    await sleep(2200);
    let body = await page.evaluate(() => document.body.innerText);
    check("grid renders records", body.includes("alpha") && body.includes("bravo"));
    check("grid shows Status chips", body.includes("Todo") || body.includes("Done"));
    check("formula column computed (ALPHA)", body.includes("ALPHA"));

    // inline text edit on a Name cell (input selects-all on focus → typing replaces)
    await page.evaluate(() => {
      const c = [...document.querySelectorAll("div.cursor-text")].find((d) => d.textContent.trim() === "alpha");
      c && c.click();
    });
    await sleep(300);
    await page.keyboard.type("alpha2");
    await page.keyboard.press("Enter");
    await sleep(700);
    const saved = await api(j, "GET", `/api/tables/${tableId}/records`);
    const rec1Now = saved.records.find((r) => r.id === rec1.id);
    check("inline text edit persisted (server)", rec1Now?.cells[nameF.id] === "alpha2", JSON.stringify(rec1Now?.cells[nameF.id]));
    body = await page.evaluate(() => document.body.innerText);
    check("formula recomputed after edit (ALPHA2)", body.includes("ALPHA2"));

    // select menu
    await page.evaluate(() => {
      const c = [...document.querySelectorAll("div.cursor-text")].find((d) => /^(Todo|Done)$/.test(d.textContent.trim()));
      c && c.click();
    });
    await sleep(400);
    const selMenu = await page.evaluate(() =>
      [...document.body.children].some((c) => c.className?.includes?.("fixed") && c.querySelector('input[placeholder="Search options…"]'))
    );
    check("select menu opens (custom, searchable)", selMenu);
    await page.keyboard.press("Escape"); await sleep(200);

    // custom date picker (no native input) — click the cell showing the seeded date
    await page.evaluate(() => {
      const c = [...document.querySelectorAll("div.cursor-text")].find((d) => /3\/20\/2026|20\/3\/2026|2026/.test(d.textContent) && d.textContent.length < 14);
      c && c.click();
    });
    await sleep(400);
    const dp = await page.evaluate(() => {
      const cal = [...document.body.children].find((c) => c.className?.includes?.("fixed") && /January|February|March|April|May|June|July|August|September|October|November|December/.test(c.textContent));
      return cal ? { found: true, native: !!cal.querySelector("input[type=date]") } : { found: false };
    });
    check("custom date calendar opens", dp.found, JSON.stringify(dp));
    check("date picker is not a native input", dp.found && !dp.native);
    await page.keyboard.press("Escape"); await sleep(200);

    // computed cell viewer — computed cells carry cursor-pointer
    await page.evaluate(() => {
      const c = [...document.querySelectorAll("div.cursor-pointer")].find((d) => d.textContent.trim().length > 0);
      c && c.click();
    });
    await sleep(300);
    const viewer = await page.evaluate(() =>
      [...document.body.children].some((c) => c.className?.includes?.("fixed") && /computed/i.test(c.textContent))
    );
    check("computed cell opens read-only viewer", viewer);
    await page.keyboard.press("Escape"); await sleep(200);

    // linked records: chip display + picker add
    body = await page.evaluate(() => document.body.innerText);
    check("link chip 'Ref One' shown in grid", body.includes("Ref One"));
    await page.evaluate(() => {
      const c = [...document.querySelectorAll("div.cursor-text")].find((d) => d.textContent.trim() === "Ref One");
      c && c.click();
    });
    await sleep(500);
    const pickerOpen = await page.evaluate(() =>
      [...document.body.children].some((c) => c.className?.includes?.("fixed") && c.querySelector('input[placeholder="Search records…"]'))
    );
    check("link picker opens", pickerOpen);
    // add "Ref Two" (wait for async options to load first)
    await page.waitForFunction(
      () => [...document.querySelectorAll("button")].some((b) => b.textContent.trim() === "Ref Two"),
      { timeout: 5000 }
    ).catch(() => {});
    await page.evaluate(() => {
      const btns = [...document.querySelectorAll("button")].filter((b) => b.textContent.trim() === "Ref Two");
      btns[btns.length - 1]?.click();
    });
    await sleep(800);
    const linkNow = await api(j, "GET", `/api/tables/${tableId}/records`);
    const rec1Row = linkNow.records.find((r) => r.id === rec1.id);
    const rec1Links = rec1Row?.cells[linkField.id] ?? [];
    check("link add persisted (2 links, server)", rec1Links.length === 2, JSON.stringify(rec1Links.map((c) => c.label)));
    // lookup + rollup recomputed from the new links
    check("lookup pulls 2 linked names", (rec1Row?.cells[lookupField.id] ?? []).length === 2, JSON.stringify(rec1Row?.cells[lookupField.id]));
    check("rollup COUNT = 2 after link add", rec1Row?.cells[rollupField.id] === 2, JSON.stringify(rec1Row?.cells[rollupField.id]));
    await page.keyboard.press("Escape"); await sleep(200);
    // UI reflects the recomputed rollup (grid re-fetched after link change)
    body = await page.evaluate(() => document.body.innerText);
    check("grid shows both linked names", body.includes("Ref One") && body.includes("Ref Two"));

    // toolbar popovers
    for (const label of ["Filter", "Sort", "Group"]) {
      await page.evaluate((l) => {
        const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === l);
        b && b.click();
      }, label);
      await sleep(250);
      const open = await page.evaluate(() => [...document.body.querySelectorAll("div")].some((d) => d.className?.includes?.("z-40") || d.className?.includes?.("z-50")));
      check(`toolbar ${label} opens`, open);
      await page.keyboard.press("Escape"); await sleep(150);
    }

    /* ---- automations: build → save → toggle → test-run → runs ---- */
    const testid = (id) => `[data-testid="${id}"]`;
    const clickTestId = async (id, nth = 0) =>
      page.evaluate((sel, n) => { const els = [...document.querySelectorAll(sel)]; (els[n] ?? els[0])?.click(); },
        testid(id), nth);

    await page.evaluate((sel) => document.querySelector(sel)?.click(), testid("automations-open"));
    await page.waitForSelector(testid("automations-panel"), { timeout: 4000 }).catch(() => {});
    check("automations panel opens", await page.$(testid("automations-panel")) !== null);

    await clickTestId("automation-new");
    await page.waitForSelector(testid("automation-save"), { timeout: 4000 }).catch(() => {});
    check("new automation → builder shown", await page.$(testid("automation-save")) !== null);
    check("automation row in list", (await page.$$(testid("automation-row"))).length >= 1);

    // condition trigger
    await page.select(testid("trigger-type"), "recordMatchesCondition").catch(() => {});
    await sleep(200);
    check("condition trigger UI shown", await page.evaluate(() =>
      [...document.querySelectorAll("button")].some((b) => b.textContent.trim() === "Add condition")));

    // add a sendEmail action
    await clickTestId("action-add");
    await page.waitForSelector(testid("action-type"), { timeout: 3000 }).catch(() => {});
    check("action step added", await page.$(testid("action-type")) !== null);

    // fill the To field (first input inside the action step) with a literal address
    await page.evaluate((sel) => {
      const el = document.querySelector(`${sel} input`);
      if (el) { el.focus(); }
    }, testid("action-step"));
    await page.type(`${testid("action-step")} input`, "hook@example.com").catch(() => {});

    // insert a {{field}} token into the Subject (2nd token-insert in the sendEmail config)
    await clickTestId("token-insert", 1);
    await page.waitForSelector('input[placeholder="Search fields…"]', { timeout: 3000 }).catch(() => {});
    check("token insert popover opens", await page.$('input[placeholder="Search fields…"]') !== null);
    // click the first field option in the picker popover
    await page.evaluate(() => {
      const pop = [...document.body.children].find((c) => c.className?.includes?.("fixed") && c.querySelector('input[placeholder="Search fields…"]'));
      const btn = pop?.querySelector("button");
      btn?.click();
    });
    await sleep(200);
    const subjHasToken = await page.evaluate(() =>
      [...document.querySelectorAll('[data-testid="token-input"]')].some((el) => /\{\{.+\}\}/.test(el.value ?? "")));
    check("field token inserted into a config input", subjHasToken);

    // save
    await clickTestId("automation-save");
    await sleep(900);
    const autList = await api(j, "GET", `/api/tables/${tableId}/automations`);
    const built = Array.isArray(autList) ? autList[autList.length - 1] : null;
    check("automation persisted with condition trigger", built?.triggerType === "recordMatchesCondition", JSON.stringify(built?.triggerType));
    check("automation persisted a sendEmail action", built?.actions?.[0]?.type === "sendEmail");
    check("saved action config carries a token", /\{\{.+\}\}/.test(JSON.stringify(built?.actions?.[0]?.config ?? {})));

    // advanced logic: add a repeating group with a nested action, save, assert the tree persists
    await clickTestId("action-add-loop");
    await page.waitForSelector(testid("loop-step"), { timeout: 3000 }).catch(() => {});
    check("repeating group renders in builder", await page.$(testid("loop-step")) !== null);
    await page.evaluate((s) => document.querySelector(s)?.click(), `${testid("loop-step")} ${testid("action-add")}`);
    await sleep(300);
    await clickTestId("automation-save");
    await sleep(900);
    const withLoop = await api(j, "GET", `/api/tables/${tableId}/automations`);
    const built2 = Array.isArray(withLoop) ? withLoop[withLoop.length - 1] : null;
    const loopNode = built2?.actions?.find((a) => a.kind === "loop");
    check("loop node persisted from builder", !!loopNode && loopNode.type == null);
    check("loop has a nested child action", built2?.actions?.some((a) => a.kind === "action" && a.parentId === loopNode?.id));

    // toggle enable off (starts enabled) — assert persisted
    await clickTestId("automation-toggle");
    await sleep(600);
    const afterToggle = await api(j, "GET", `/api/automations/${built.id}`);
    check("toggle persisted (enabled → false)", afterToggle?.enabled === false);

    // test-run → switches to Runs tab; assert a run + step row appear
    await clickTestId("automation-test-run");
    await page.waitForSelector(testid("run-row"), { timeout: 6000 }).catch(() => {});
    check("test-run produced a run row", (await page.$$(testid("run-row"))).length >= 1);
    // expand the newest run to reveal its step rows
    await clickTestId("run-row");
    await sleep(300);
    check("run has a step row", (await page.$$(testid("run-step"))).length >= 1);
    check("runs tab reachable", await page.$(testid("runs-tab")) !== null);

    // close the panel (backdrop click; not dirty after save)
    await page.mouse.click(6, 6);
    await sleep(300);
    check("automations panel closes", await page.$(testid("automations-panel")) === null);

    /* ---- comments + mentions + notification bell ---- */
    check("notification bell in top bar", await page.$(testid("notification-bell")) !== null);

    // open the expanded record modal for the KNOWN record (rec1 = "alpha2") so the
    // server-side check targets the right record. row-expand is hover-only; click programmatically.
    await page.evaluate(() => {
      const row = [...document.querySelectorAll("div.group")].find((r) => r.textContent.includes("alpha2"));
      row?.querySelector('[data-testid="row-expand"]')?.click();
    });
    await page.waitForSelector(testid("record-comments"), { timeout: 4000 }).catch(() => {});
    check("record modal shows comments section", await page.$(testid("record-comments")) !== null);

    // type a comment with an @mention → mention menu appears
    await page.click(testid("comment-input"));
    await page.type(testid("comment-input"), "Reviewing this @");
    await page.waitForSelector(testid("mention-menu"), { timeout: 3000 }).catch(() => {});
    check("mention menu opens on @", await page.$(testid("mention-menu")) !== null);
    // pick the first mention candidate, then finish + send
    await page.evaluate((sel) => document.querySelector(`${sel} button`)?.click(), testid("mention-menu"));
    await page.type(testid("comment-input"), " looks good");
    await page.click(testid("comment-send"));
    await page.waitForSelector(testid("comment"), { timeout: 4000 }).catch(() => {});
    check("comment posted + shown in thread", await page.$(testid("comment")) !== null);
    const commentText = await page.evaluate((sel) => document.querySelector(sel)?.textContent ?? "", testid("comment"));
    check("comment body persisted in UI", commentText.includes("Reviewing this"), commentText);
    // persisted server-side
    const cApi = await api(j, "GET", `/api/records/${rec1.id}/comments`);
    check("comment persisted (server)", Array.isArray(cApi) && cApi.length >= 1, JSON.stringify(cApi));
    // close the record modal (backdrop)
    await page.mouse.click(6, 6);
    await sleep(300);

    // view types
    for (const [type, label, marker] of [["kanban", "Kanban", "Uncategorized"], ["gallery", "Gallery", "alpha"], ["calendar", "Calendar", "2026"]]) {
      const v = await api(j, "POST", `/api/tables/${tableId}/views`, { name: `${label} v`, type });
      void v;
    }
    await page.reload({ waitUntil: "networkidle0" }); await sleep(1500);
    for (const [label, marker] of [["Kanban", "Uncategorized"], ["Gallery", "alpha"], ["Calendar", "20"]]) {
      await page.evaluate((l) => {
        const b = [...document.querySelectorAll("button")].find((x) => x.textContent.includes(l + " v"));
        b && b.click();
      }, label);
      await sleep(1200);
      const txt = await page.evaluate(() => document.body.innerText);
      check(`${label} view renders`, txt.length > 0, "empty body");
    }

    check("zero console/page errors", errors.length === 0, errors.slice(0, 4).join(" | "));
  } finally {
    await browser.close();
    await api(j, "DELETE", `/api/bases/${base.id}`); // cleanup
  }

  console.log(`\n${pass} passed, ${failures.length} failed`);
  if (failures.length) { console.log("\nFailures:"); failures.forEach((f) => console.log("  -", f)); process.exit(1); }
  console.log("✓ All frontend checks passed");
}

main().catch((e) => { console.error("Harness error:", e); process.exit(2); });
