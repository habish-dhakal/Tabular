// Load test — Tabular. Run against a PRODUCTION build, never `next dev`.
//
//   npm run build && PORT=3100 npm run start   # in one terminal
//   npm run worker                             # in another (automations under load)
//   k6 run scripts/load-test.js                # ramps to 300 virtual users
//
// Simulates one busy workspace: all VUs share a load user and hammer one table
// with an 80% read / 20% write mix. Fails the run if error rate or p95 latency
// breach the thresholds below.
import http from "k6/http";
import { check, sleep } from "k6";

const BASE = __ENV.BASE_URL || "http://localhost:3100";
const EMAIL = __ENV.LOAD_EMAIL || "load@tabular.dev";
const PEAK = Number(__ENV.PEAK_VUS || 300);

export const options = {
  stages: [
    { duration: "30s", target: Math.round(PEAK * 0.17) }, // warm up
    { duration: "1m", target: Math.round(PEAK * 0.5) },
    { duration: "2m", target: PEAK }, // ramp to full 300
    { duration: "3m", target: PEAK }, // hold at peak
    { duration: "30s", target: 0 }, // ramp down
  ],
  thresholds: {
    http_req_failed: ["rate<0.01"], // < 1% errors
    http_req_duration: ["p(95)<500", "p(99)<1500"], // latency ceiling
  },
};

// dev Credentials provider: GET csrf, then POST the callback (form-encoded).
// k6 resets the cookie jar between iterations, so after logging in we snapshot
// the resulting cookies into a header string and resend it on every request.
function login() {
  const csrf = http.get(`${BASE}/api/auth/csrf`).json("csrfToken");
  const res = http.post(
    `${BASE}/api/auth/callback/dev`,
    { csrfToken: csrf, email: EMAIL, json: "true" },
    { headers: { "content-type": "application/x-www-form-urlencoded" } }
  );
  check(res, { "login ok": (r) => r.status === 200 || r.status === 302 });
  const jar = http.cookieJar().cookiesForURL(BASE);
  return Object.keys(jar)
    .map((name) => `${name}=${jar[name][0]}`)
    .join("; ");
}

// setup() runs once: log in, build a base + table + fields, seed rows.
export function setup() {
  login();
  const wsId = http.get(`${BASE}/api/workspaces`).json("workspaces.0.id");
  const baseId = http
    .post(`${BASE}/api/workspaces/${wsId}/bases`, JSON.stringify({ name: "LoadTest" }), {
      headers: { "content-type": "application/json" },
    })
    .json("id");
  // POST /tables nests the row under `table` and returns the auto-created
  // primary field id; reuse it rather than adding a second field.
  const tbl = http
    .post(`${BASE}/api/bases/${baseId}/tables`, JSON.stringify({ name: "Load" }), {
      headers: { "content-type": "application/json" },
    })
    .json();
  const tableId = tbl.table.id;
  const fieldId = tbl.primaryFieldId;
  for (let i = 0; i < 200; i++) {
    http.post(
      `${BASE}/api/tables/${tableId}/records`,
      JSON.stringify({ cells: { [fieldId]: `seed ${i}` } }),
      { headers: { "content-type": "application/json" } }
    );
  }
  return { baseId, tableId, fieldId };
}

// One iteration per VU. Log in once per VU, cache the cookie header, reuse it.
let cookie = null;
export default function (data) {
  if (!cookie) cookie = login();
  const read = { headers: { cookie } };
  const write = { headers: { cookie, "content-type": "application/json" } };

  // 80% read: list the table's records (the hot path for the grid)
  const list = http.get(`${BASE}/api/tables/${data.tableId}/records`, read);
  check(list, { "list 200": (r) => r.status === 200 });

  // 20% write: create then patch a record
  if (Math.random() < 0.2) {
    const rec = http.post(
      `${BASE}/api/tables/${data.tableId}/records`,
      JSON.stringify({ cells: { [data.fieldId]: `vu${__VU}-${Date.now()}` } }),
      write
    );
    if (rec.status === 200) {
      const id = rec.json("id");
      http.patch(
        `${BASE}/api/records/${id}`,
        JSON.stringify({ cells: { [data.fieldId]: "edited" } }),
        write
      );
    }
  }
  sleep(Math.random() * 1 + 0.5); // 0.5-1.5s think time between actions
}

// teardown() runs once at the end: delete the test base so demo data stays clean.
export function teardown(data) {
  login();
  http.del(`${BASE}/api/bases/${data.baseId}`);
}
