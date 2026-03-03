import http from "k6/http";
import { check, sleep } from "k6";

export const options = {
  stages: [
    { duration: "10s", target: 50 }, // Ramp up to 50 concurrent users
    { duration: "30s", target: 50 }, // Hold at 50 users
    { duration: "10s", target: 0 }, // Ramp down to 0
  ],
  thresholds: {
    http_req_duration: ["p(95)<500"], // 95% of requests must complete below 500ms
    http_req_failed: ["rate<0.01"], // Error rate must be < 1%
  },
};

const BASE_URL = "http://localhost:3001";

// We use setup() to create a pool of users to avoid DB lock issues during registration in the actual test
export function setup() {
  const users = [];
  const numUsers = 50;

  for (let i = 0; i < numUsers; i++) {
    const email = `k6-user-${Date.now()}-${i}@test.com`;
    const res = http.post(
      `${BASE_URL}/api/auth/register`,
      JSON.stringify({
        email,
        password: "SecurePass123!",
        displayName: `K6 User ${i}`,
      }),
      {
        headers: { "Content-Type": "application/json" },
      },
    );

    // Store active tokens for the test
    if (res.status === 201) {
      users.push({
        email,
        accessToken: res.json("tokens.accessToken"),
      });
    }
  }

  // Return the user pool so the main function can use it
  return { users };
}

export default function (data) {
  if (!data.users || data.users.length === 0) {
    return; // Fallback if setup failed
  }

  // Pick a random user from the pool setup generated
  const user = data.users[Math.floor(Math.random() * data.users.length)];
  const headers = {
    Authorization: `Bearer ${user.accessToken}`,
    "Content-Type": "application/json",
  };

  // 1. Health Check
  let res = http.get(`${BASE_URL}/health`);
  check(res, { "status is 200": (r) => r.status === 200 });
  sleep(1);

  // 2. Add an item to their library
  const itemId = `tt${Math.floor(Math.random() * 10000000)}`;
  res = http.post(
    `${BASE_URL}/api/library`,
    JSON.stringify({
      type: "movie",
      itemId,
      title: `K6 Test Movie ${itemId}`,
      poster: "https://example.com/poster.jpg",
    }),
    { headers },
  );

  check(res, { "library add is 201": (r) => r.status === 201 });
  sleep(1);

  // 3. Fetch Library
  res = http.get(`${BASE_URL}/api/library`, { headers });
  check(res, { "library fetch is 200": (r) => r.status === 200 });
  sleep(1);

  // 4. Report Progress (watching)
  res = http.post(
    `${BASE_URL}/api/library/progress`,
    JSON.stringify({
      type: "movie",
      itemId,
      currentTime: 1200,
      duration: 7200,
      title: `K6 Test Movie ${itemId}`,
      poster: "https://example.com/poster.jpg",
    }),
    { headers },
  );

  check(res, { "progress report is 200": (r) => r.status === 200 });
  sleep(1);

  // 5. Fetch Continue Watching
  res = http.get(`${BASE_URL}/api/library/progress`, { headers });
  check(res, { "continue watching fetch is 200": (r) => r.status === 200 });
}
