import type { LibraryItem, WatchProgress } from "@streamer/shared";
import type { WindowClass } from "../../hooks/useWindowClass";
import {
  isTaskOfflinePlayable,
  type DownloadTask,
} from "../../stores/downloadStore";

export type LibraryFilter = "all" | "movie" | "series" | "offline" | "history";

export type LibraryCardItem = Pick<
  LibraryItem,
  "id" | "itemId" | "type" | "title" | "poster"
>;

export type LibraryGridItem =
  | {
      key: string;
      selectionKey: string;
      kind: "library" | "offline";
      item: LibraryCardItem;
      downloadTaskId?: string;
    }
  | {
      key: string;
      selectionKey: string;
      kind: "history";
      item: LibraryCardItem;
      history: WatchProgress;
    };

export function buildLibraryGridItems(
  items: LibraryItem[] | undefined,
  tasks: Record<string, DownloadTask>,
  filter: LibraryFilter,
  history: WatchProgress[] = [],
): LibraryGridItem[] {
  if (filter === "history") {
    return history.map((entry) => ({
      key: `history:${entry.id}`,
      selectionKey: `history:${entry.id}`,
      kind: "history" as const,
      history: entry,
      item: {
        id: entry.id,
        itemId: entry.itemId,
        type: entry.type,
        title: entry.title,
        poster: entry.poster ?? null,
      },
    }));
  }

  if (filter === "offline") {
    return Object.values(tasks)
      .filter(isTaskOfflinePlayable)
      .map((task) => ({
        key: `download:${task.id}`,
        selectionKey: `download:${task.id}`,
        kind: "offline" as const,
        downloadTaskId: task.id,
        item: {
          id: task.id,
          itemId: task.mediaInfo.itemId,
          type: task.mediaInfo.type,
          title: task.mediaInfo.title,
          poster: task.mediaInfo.poster ?? null,
        },
      }));
  }

  return (items ?? [])
    .filter((item) => filter === "all" || item.type === filter)
    .map((item) => ({
      key: `library:${item.id}`,
      selectionKey: `library:${item.id}`,
      kind: "library" as const,
      item,
    }));
}

export type LibraryGridMetrics = {
  columns: number;
  cardWidth: number;
  gap: number;
  horizontalGutter: number;
};

export function canStartLibrarySelection(
  filter: LibraryFilter,
  itemCount: number,
) {
  return filter !== "offline" && filter !== "history" && itemCount > 0;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function getLibraryGridMetrics(
  containerWidth: number,
  windowClass: WindowClass,
): LibraryGridMetrics {
  const horizontalGutter =
    windowClass === "compact"
      ? 16
      : windowClass === "medium"
        ? 24
        : windowClass === "expanded"
          ? 32
          : 40;
  const gap = 16;
  const contentWidth = Math.max(0, Math.min(containerWidth, 1600));
  const available = Math.max(0, contentWidth - horizontalGutter * 2);

  const columns =
    windowClass === "compact"
      ? 2
      : windowClass === "medium"
        ? 3
        : windowClass === "expanded"
          ? clamp(Math.floor((available + gap) / (184 + gap)), 4, 5)
          : clamp(Math.floor((available + gap) / (198 + gap)), 5, 7);
  const targetCardWidth = windowClass === "compact" ? 220 : 198;
  const cardWidth = Math.min(
    targetCardWidth,
    Math.max(112, Math.floor((available - gap * (columns - 1)) / columns)),
  );

  return { columns, cardWidth, gap, horizontalGutter };
}
