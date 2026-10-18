// Load test for the public site and API (NFR §1–2). Run: task loadtest (local), or against staging:
//   k6 run -e WEB=https://alanfelez.ir -e API=https://api.alanfelez.ir -e PEAK=300 deploy/loadtest/public.js
// PEAK is the concurrent-visitor target (NFR §1: 300 at launch, 2,000 after a year). Never point this at production
// during market hours.
import http from "k6/http";
import { check, group, sleep } from "k6";

const WEB = __ENV.WEB || "http://localhost:3000";
const API = __ENV.API || "http://localhost:8080";
const PEAK = Number(__ENV.PEAK || 50);
const HOLD = __ENV.HOLD || "2m";

export const options = {
  scenarios: {
    // Anonymous visitors browsing like the analytics suggest: mostly home and prices, some content.
    visitors: {
      executor: "ramping-vus",
      stages: [
        { duration: "30s", target: PEAK },
        { duration: HOLD, target: PEAK },
        { duration: "20s", target: 0 },
      ],
      exec: "visitor",
    },
    // The API on its own (what the website server and the admin call).
    api: {
      executor: "constant-arrival-rate",
      rate: Math.max(10, PEAK),
      timeUnit: "1s",
      duration: HOLD,
      startTime: "30s",
      preAllocatedVUs: Math.max(10, PEAK / 2),
      exec: "apiReads",
    },
  },
  thresholds: {
    // NFR PERF-2: API reads p95 ≤ 200 ms, p99 ≤ 500 ms.
    "http_req_duration{kind:api}": ["p(95)<200", "p(99)<500"],
    // Server-rendered HTML (the browser budget, LCP ≤ 2.5 s, needs this well under a second).
    "http_req_duration{kind:page}": ["p(95)<800"],
    http_req_failed: ["rate<0.01"],
    checks: ["rate>0.99"],
  },
};

const pages = ["/", "/prices", "/chart", "/analysis", "/faq", "/plans", "/auctions"];

export function visitor() {
  group("pages", () => {
    const path = pages[Math.floor(Math.random() * pages.length)];
    const res = http.get(`${WEB}${path}`, { tags: { kind: "page", name: path } });
    check(res, { "page 200": (r) => r.status === 200 });
  });
  sleep(2 + Math.random() * 4); // think time between pages
}

const reads = ["/v1/prices?base=true", "/v1/prices", "/v1/series/copper-red-free/points?range=1M", "/v1/articles?limit=7", "/v1/faq", "/v1/auctions", "/v1/plans"];

export function apiReads() {
  const path = reads[Math.floor(Math.random() * reads.length)];
  const res = http.get(`${API}${path}`, { tags: { kind: "api", name: path.split("?")[0] } });
  check(res, { "api 200": (r) => r.status === 200 });
}
