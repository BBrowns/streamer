const assert = require("node:assert/strict");
const {
  getRequestedSegmentIndices,
  startPlaybackFixtureServer,
  stopPlaybackFixtureServer,
} = require("./playback-fixture-server");

async function waitForTimelineTime(minSeconds, maxSeconds, timeoutMs = 30000) {
  const timelineTime = element(by.id("player-timeline-current-time"));
  const deadline = Date.now() + timeoutMs;
  let lastAttributes;

  while (Date.now() < deadline) {
    lastAttributes = await timelineTime.getAttributes();
    const text = JSON.stringify(lastAttributes);
    const displayedTimes = [
      ...text.matchAll(/(?:^|[^\d])(\d+):(\d{2})(?!\d)/g),
    ].map((match) => Number(match[1]) * 60 + Number(match[2]));
    const matchedTime = displayedTimes.find(
      (seconds) => seconds >= minSeconds && seconds <= maxSeconds,
    );
    if (matchedTime !== undefined) return matchedTime;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(
    `Player timeline did not reach ${minSeconds}-${maxSeconds}s. Last attributes: ${JSON.stringify(lastAttributes)}`,
  );
}

async function waitForSegmentRequests(timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const requestedSegments = getRequestedSegmentIndices();
    if (requestedSegments.length > 0) return requestedSegments;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("The player did not request any HLS segments.");
}

describe("Native player timeline", () => {
  beforeAll(async () => {
    await startPlaybackFixtureServer();
    await device.launchApp({ newInstance: true, delete: true });
    await waitFor(element(by.id("home-screen")))
      .toBeVisible()
      .withTimeout(30000);
    await device.openURL({ url: "streamer:///e2e/player-fixture" });
  });

  afterAll(async () => {
    await stopPlaybackFixtureServer();
  });

  it("uses probed duration and confirms a far HLS scrub", async () => {
    await waitFor(element(by.id("player-screen")))
      .toBeVisible()
      .withTimeout(30000);
    await waitFor(element(by.text("3:00")))
      .toBeVisible()
      .withTimeout(30000);
    const startupSegments = await waitForSegmentRequests();

    await element(by.id("player-progress-slider")).swipe(
      "right",
      "fast",
      0.55,
      0.1,
      0.5,
    );
    const confirmedSeconds = await waitForTimelineTime(145, 165);

    assert.ok(
      confirmedSeconds >= 145 && confirmedSeconds <= 165,
      `Confirmed seek landed at ${confirmedSeconds}s instead of 145-165s.`,
    );
    const requestedSegments = getRequestedSegmentIndices();
    const seekSegment = Math.floor(confirmedSeconds / 2);
    const seekWindowStart = seekSegment - 12;
    const seekWindowEnd = Math.min(89, seekSegment + 18);
    const uniqueRequestedSegments = new Set(requestedSegments);
    const duplicateRequestCount =
      requestedSegments.length - uniqueRequestedSegments.size;
    const startupSegmentLimit = 26;
    const outsideLocalWindows = [
      ...new Set(
        requestedSegments.filter(
          (index) =>
            index > startupSegmentLimit &&
            (index < seekWindowStart || index > seekWindowEnd),
        ),
      ),
    ];

    console.info(
      "Android HLS fixture segment requests:",
      JSON.stringify({
        confirmedSeconds,
        startupSegments,
        seekWindow: [seekWindowStart, seekWindowEnd],
        requestCount: requestedSegments.length,
        uniqueSegmentCount: uniqueRequestedSegments.size,
        duplicateRequestCount,
        requestedSegments,
      }),
    );

    assert.ok(
      startupSegments.length > 0,
      "The player did not request startup segments before the seek.",
    );
    assert.ok(
      startupSegments.length > 0 &&
        startupSegments.some((index) => index <= startupSegmentLimit) &&
        requestedSegments.some(
          (index) => index >= seekWindowStart && index <= seekWindowEnd,
        ),
      `No startup segment or HLS segment near seek position ${confirmedSeconds}s (segment ${seekSegment}) was requested. Requests: ${requestedSegments.join(", ")}`,
    );
    assert.deepEqual(
      outsideLocalWindows,
      [],
      `Fetched segments outside the startup and seek windows: ${outsideLocalWindows.join(", ")}. All requests: ${requestedSegments.join(", ")}`,
    );
    assert.ok(
      uniqueRequestedSegments.size <= 58,
      `The player fetched ${uniqueRequestedSegments.size} unique segments; expected at most 58 of the 90 title segments. Requests: ${requestedSegments.join(", ")}`,
    );
    assert.ok(
      requestedSegments.length < 68,
      `The player made ${requestedSegments.length} segment requests (${duplicateRequestCount} duplicates); expected fewer than 68. Requests: ${requestedSegments.join(", ")}`,
    );
  });
});
