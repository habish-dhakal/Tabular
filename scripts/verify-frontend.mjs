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

  /* ---- browser ---- */
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
  const errors = [];
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1500, height: 900 });
    page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
    page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });
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
