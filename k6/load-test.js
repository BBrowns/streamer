import http from "k6/http";
import { check, sleep } from "k6";
import { SharedArray } from "k6/data";

export const options = {
  stages: [
    { duration: "10s", target: 50 }, // Ramp up to 50 users
    { duration: "20s", target: 100 }, // Ramp to 100 users
    { duration: "10s", target: 0 }, // Ramp down
  ],
  thresholds: {
    http_req_duration: ["p(95)<500"], // 95th percentile < 500ms
    http_req_failed: ["rate<0.05"], // Less than 5% failure rate
  },
};

const BASE_URL = __ENV.BASE_URL || "http://localhost:3001";

// Register + login to get a token
export function setup() {
  const timestamp = Date.now();
  const email = `loadtest-${timestamp}@test.com`;

  const registerRes = http.post(
    `${BASE_URL}/api/auth/register`,
    JSON.stringify({ email, password: "loadtest123" }),
    { headers: { "Content-Type": "application/json" } },
  );

  const body = JSON.parse(registerRes.body);
  return { token: body.tokens?.accessToken || "" };
}

export default function (data) {
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${data.token}`,
  };

  // Test 1: Fetch movie catalog
  const catalogRes = http.get(`${BASE_URL}/api/catalog/movie`, { headers });
  check(catalogRes, {
    "catalog status 200": (r) => r.status === 200,
    "catalog has metas": (r) => JSON.parse(r.body).metas !== undefined,
  });

  // Test 2: Fetch stream
  const streamRes = http.get(`${BASE_URL}/api/stream/movie/tt0111161`, {
    headers,
  });
  check(streamRes, {
    "stream status 200": (r) => r.status === 200,
    "stream has streams": (r) => JSON.parse(r.body).streams !== undefined,
  });

  // Test 3: Health check
  const healthRes = http.get(`${BASE_URL}/health`);
  check(healthRes, {
    "health status 200": (r) => r.status === 200,
  });

  sleep(0.5);
}
