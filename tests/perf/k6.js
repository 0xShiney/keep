/**
 * k6 load test for the NFR targets. Run against a deployment seeded with the
 * fixture generator (10k files, 50k commits — see docs/DEVELOPMENT.md):
 *
 *   k6 run -e BASE_URL=https://app.example.com -e COOKIE="keep_session=..." tests/perf/k6.js
 *
 * A session cookie is required because every route is authenticated; obtain one
 * by logging in through the browser and copying the cookie value.
 *
 * Thresholds encode the blueprint's numbers. They have NOT been measured in the
 * delivery workspace (no Docker / no load generator), so treat these as gates,
 * not as evidence.
 */
import http from "k6/http";
import { check, sleep } from "k6";

const BASE = __ENV.BASE_URL;
const COOKIE = __ENV.COOKIE ?? "";
const REPO = __ENV.REPO ?? "ada/keep";

export const options = {
  scenarios: {
    dashboard: {
      executor: "constant-vus",
      exec: "dashboard",
      vus: 10,
      duration: "60s",
    },
    tree: {
      executor: "constant-vus",
      exec: "tree",
      vus: 5,
      duration: "60s",
      startTime: "65s",
    },
    commits: {
      executor: "constant-vus",
      exec: "commits",
      vus: 5,
      duration: "60s",
      startTime: "130s",
    },
  },
  thresholds: {
    "http_req_duration{page:dashboard}": ["p(95)<300"],
    "http_req_duration{page:tree}": ["p(95)<250"],
    "http_req_duration{page:commits}": ["p(95)<300"],
    "http_req_duration{page:blob}": ["p(95)<400"],
    http_req_failed: ["rate<0.01"],
  },
};

const headers = { cookie: COOKIE };

export function dashboard() {
  const res = http.get(`${BASE}/`, { headers, tags: { page: "dashboard" } });
  check(res, { "dashboard 200": (r) => r.status === 200 });
  sleep(1);
}

export function tree() {
  const res = http.get(`${BASE}/${REPO}/tree/main`, { headers, tags: { page: "tree" } });
  check(res, { "tree 200": (r) => r.status === 200 });
  sleep(1);
}

export function commits() {
  const res = http.get(`${BASE}/${REPO}/commits`, { headers, tags: { page: "commits" } });
  check(res, { "commits 200": (r) => r.status === 200 });
  sleep(1);
}
