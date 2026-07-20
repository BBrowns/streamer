import type { InAppNotification } from "@streamer/shared";

export type NotificationGroupKey = "today" | "thisWeek" | "earlier";

export type NotificationGroup = {
  key: NotificationGroupKey;
  data: InAppNotification[];
};

function asValidDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfToday(now: Date) {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/**
 * Keeps the inbox scan-friendly without treating an unknown timestamp as a
 * current event. The API sorts newest first, but this also protects the UI
 * when sync data reaches devices out of order.
 */
export function groupNotificationsByRecency(
  notifications: readonly InAppNotification[],
  now = new Date(),
): NotificationGroup[] {
  const startToday = startOfToday(now).getTime();
  const startThisWeek = startToday - 6 * 24 * 60 * 60 * 1_000;
  const buckets: Record<NotificationGroupKey, InAppNotification[]> = {
    today: [],
    thisWeek: [],
    earlier: [],
  };

  [...notifications]
    .sort((left, right) => {
      const leftTime = asValidDate(left.createdAt)?.getTime() ?? -Infinity;
      const rightTime = asValidDate(right.createdAt)?.getTime() ?? -Infinity;
      return rightTime - leftTime;
    })
    .forEach((notification) => {
      const timestamp = asValidDate(notification.createdAt)?.getTime();
      const key: NotificationGroupKey =
        timestamp !== undefined && timestamp >= startToday
          ? "today"
          : timestamp !== undefined && timestamp >= startThisWeek
            ? "thisWeek"
            : "earlier";
      buckets[key].push(notification);
    });

  return (Object.keys(buckets) as NotificationGroupKey[])
    .map((key) => ({ key, data: buckets[key] }))
    .filter((group) => group.data.length > 0);
}

export function formatNotificationTimestamp(
  createdAt: string,
  locale: string,
  now = new Date(),
) {
  const date = asValidDate(createdAt);
  if (!date) return "";

  const startToday = startOfToday(now).getTime();
  const timeOptions: Intl.DateTimeFormatOptions = {
    hour: "2-digit",
    minute: "2-digit",
  };

  if (date.getTime() >= startToday) {
    return new Intl.DateTimeFormat(locale, timeOptions).format(date);
  }

  const startThisWeek = startToday - 6 * 24 * 60 * 60 * 1_000;
  if (date.getTime() >= startThisWeek) {
    return new Intl.DateTimeFormat(locale, {
      weekday: "short",
      ...timeOptions,
    }).format(date);
  }

  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: date.getFullYear() === now.getFullYear() ? undefined : "numeric",
  }).format(date);
}
