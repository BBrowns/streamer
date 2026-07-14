import {
  isTaskOfflinePlayable,
  type DownloadTask,
} from "../../stores/downloadStore";
import { getDownloadRecovery } from "../../services/actionRecovery";

export type DownloadQueueGroup = "active" | "attention" | "ready";
export type DownloadPrimaryAction =
  | "pause"
  | "resume"
  | "play"
  | "retry"
  | "replan"
  | "verify"
  | "repair_bridge"
  | "free_storage"
  | "remove";

export function getDownloadQueueGroup(task: DownloadTask): DownloadQueueGroup {
  if (task.status === "Error") return "attention";
  if (isTaskOfflinePlayable(task)) return "ready";
  if (task.status === "Completed") return "attention";
  return "active";
}

export function getDownloadPrimaryAction(
  task: DownloadTask,
): DownloadPrimaryAction | null {
  if (isTaskOfflinePlayable(task)) return "play";
  if (task.status === "Downloading") return "pause";
  const recovery = getDownloadRecovery(task);
  if (recovery?.action === "retry" && task.status === "Paused") return "resume";
  if (
    recovery?.action === "retry" ||
    recovery?.action === "replan" ||
    recovery?.action === "verify" ||
    recovery?.action === "repair_bridge" ||
    recovery?.action === "free_storage" ||
    recovery?.action === "remove"
  ) {
    return recovery.action;
  }
  return null;
}

export function getDownloadStatusKey(task: DownloadTask) {
  if (isTaskOfflinePlayable(task)) return "readyOffline";

  switch (task.status) {
    case "Pending":
      return "queued";
    case "Preparing":
      return "preparing";
    case "Downloading":
      return "downloading";
    case "Verifying":
      return "verifying";
    case "Paused":
      return "paused";
    case "Completed":
      return "needsVerification";
    case "Error":
      return "error";
  }
}

export function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return null;

  const units = ["B", "KB", "MB", "GB", "TB"];
  const exponent = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  const value = bytes / 1024 ** exponent;
  const precision =
    exponent === 0 || value >= 10 || Number.isInteger(value) ? 0 : 1;
  return `${value.toFixed(precision)} ${units[exponent]}`;
}

export function getDownloadSizeLabel(task: DownloadTask) {
  const written = formatBytes(task.totalBytesWritten);
  const expected = formatBytes(task.totalBytesExpectedToWrite);

  if (written && expected && task.status !== "Completed") {
    return `${written} of ${expected}`;
  }
  return expected || written;
}

export function sortDownloadTasks(tasks: DownloadTask[]) {
  return [...tasks].sort((a, b) => {
    const groupOrder: Record<DownloadQueueGroup, number> = {
      active: 0,
      attention: 1,
      ready: 2,
    };
    const groupDifference =
      groupOrder[getDownloadQueueGroup(a)] -
      groupOrder[getDownloadQueueGroup(b)];
    if (groupDifference !== 0) return groupDifference;
    return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
  });
}

export function getDownloadQueueSummary(tasks: DownloadTask[]) {
  return tasks.reduce(
    (summary, task) => {
      const group = getDownloadQueueGroup(task);
      summary[group] += 1;
      if (group === "ready") {
        summary.readyBytes +=
          task.totalBytesExpectedToWrite || task.totalBytesWritten || 0;
      }
      if (task.status === "Completed" && !isTaskOfflinePlayable(task)) {
        summary.needsVerification += 1;
      }
      return summary;
    },
    {
      active: 0,
      attention: 0,
      ready: 0,
      readyBytes: 0,
      needsVerification: 0,
    },
  );
}
