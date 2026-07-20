import type { InAppNotification } from "@streamer/shared";
import {
  formatNotificationTimestamp,
  groupNotificationsByRecency,
} from "../notificationPresentation";

const now = new Date("2026-07-18T15:00:00.000Z");

function notification(id: string, createdAt: string): InAppNotification {
  return {
    id,
    userId: "00000000-0000-4000-8000-000000000001",
    title: `Notification ${id}`,
    message: "A useful update.",
    read: false,
    createdAt,
  };
}

describe("groupNotificationsByRecency", () => {
  it("groups and sorts inbox items by local recency", () => {
    const groups = groupNotificationsByRecency(
      [
        notification("earlier", "2026-07-09T12:00:00.000Z"),
        notification("today-old", "2026-07-18T09:00:00.000Z"),
        notification("week", "2026-07-15T12:00:00.000Z"),
        notification("today-new", "2026-07-18T14:00:00.000Z"),
      ],
      now,
    );

    expect(groups.map((group) => group.key)).toEqual([
      "today",
      "thisWeek",
      "earlier",
    ]);
    expect(groups[0]?.data.map((item) => item.id)).toEqual([
      "today-new",
      "today-old",
    ]);
  });

  it("places malformed timestamps in Earlier instead of presenting them as new", () => {
    const groups = groupNotificationsByRecency(
      [notification("unknown", "not-a-date")],
      now,
    );

    expect(groups).toEqual([
      expect.objectContaining({ key: "earlier", data: [expect.any(Object)] }),
    ]);
  });
});

describe("formatNotificationTimestamp", () => {
  it("uses a compact, local date for older notifications", () => {
    expect(
      formatNotificationTimestamp("2025-07-10T12:00:00.000Z", "en-US", now),
    ).toContain("2025");
    expect(formatNotificationTimestamp("not-a-date", "en-US", now)).toBe("");
  });
});
