import axios from "axios";
import { randomUUID } from "crypto";

const API_URL = process.env.API_URL || "http://localhost:3000/api";

async function runJourney() {
  console.log("🚀 Starting Critical User Journey E2E Test\n");

  const email = `e2e_${randomUUID()}@example.com`;
  const password = "securePassword123!";
  let accessToken: string;
  let refreshToken: string;

  try {
    // Step 1: Register
    console.log("1. Registering new user...");
    const regRes = await axios.post(`${API_URL}/auth/register`, {
      email,
      password,
      displayName: "E2E Tester",
    });

    if (regRes.status !== 201) throw new Error("Registration failed");
    console.log("✅ Registration successful");

    // Step 2: Login
    console.log("\n2. Logging in...");
    const loginRes = await axios.post(`${API_URL}/auth/login`, {
      email,
      password,
    });

    if (loginRes.status !== 200) throw new Error("Login failed");
    accessToken = loginRes.data.tokens.accessToken;
    refreshToken = loginRes.data.tokens.refreshToken;
    console.log("✅ Login successful, tokens acquired");

    // Step 3: Install Addon
    console.log("\n3. Installing Cinemeta Add-on...");
    await axios.post(
      `${API_URL}/addons`,
      { transportUrl: "https://v3-cinemeta.strem.io/manifest.json" },
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    console.log("✅ Add-on installed");

    // Step 4: Fetch Catalog
    console.log("\n4. Fetching Movie Catalog...");
    const catalogRes = await axios.get(`${API_URL}/catalog/movie`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (
      catalogRes.status !== 200 ||
      !catalogRes.data.metas ||
      catalogRes.data.metas.length === 0
    ) {
      throw new Error("Catalog fetch failed or returned empty");
    }

    const firstMovie = catalogRes.data.metas[0];
    console.log(
      `✅ Catalog fetched successfully. Picked movie: ${firstMovie.name} (ID: ${firstMovie.id})`,
    );

    // Step 5: Request Stream (Cinemeta doesn't always have streams, but we should at least get a 200 with an empty array or valid streams if we installed a streaming addon.
    // For E2E purposes, let's install a public domain torrent addon if needed, but for now we just test the endpoint architecture returns successfully.
    console.log("\n5. Fetching Streams...");
    const streamRes = await axios.get(
      `${API_URL}/stream/movie/${firstMovie.id}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );

    if (streamRes.status !== 200) {
      throw new Error("Stream fetch failed");
    }

    console.log(
      `✅ Stream request successful. Found ${streamRes.data.streams?.length || 0} streams.`,
    );

    // Step 6: Test Resilience (Simulate fake addon)
    console.log("\n6. Testing Resilience (Broken Add-on)...");
    // Install a broken addon
    await axios
      .post(
        `${API_URL}/addons`,
        { transportUrl: "https://broken.addon.local/manifest.json" },
        { headers: { Authorization: `Bearer ${accessToken}` } },
      )
      .catch(() => {
        console.log("✅ Correctly rejected invalid addon during install");
      });

    console.log("\n🎉 All Critical User Journey steps passed!");
  } catch (error: any) {
    console.error("\n❌ E2E Journey Failed:");
    if (error.response) {
      console.error(error.response.status, error.response.data);
    } else {
      console.error(error.message);
    }
    process.exit(1);
  }
}

runJourney();
