import { fireEvent, render } from "@testing-library/react-native";
import type { DownloadTask } from "../../../stores/downloadStore";
import { DownloadQueueCard } from "../DownloadQueueCard";

jest.mock("@expo/vector-icons", () => ({
  Ionicons: () => null,
}));

jest.mock("../../../hooks/useTheme", () => ({
  useTheme: () => ({
    isDark: false,
    colors: {
      card: "#ffffff",
      border: "#dddddd",
      error: "#b42318",
      success: "#16803c",
      warning: "#9a6700",
      tint: "#8064e8",
      text: "#211c2b",
      textSecondary: "#6f687b",
    },
  }),
}));

jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (_key: string, options?: { defaultValue?: string }) =>
      options?.defaultValue || _key,
  }),
}));

function makeTask(
  id: string,
  overrides: Partial<DownloadTask> = {},
): DownloadTask {
  return {
    id,
    mediaInfo: {
      type: "movie",
      itemId: `tt-${id}`,
      title: `Movie ${id}`,
      downloadUrl: `https://cdn.example.test/${id}.mp4`,
    },
    progress: 0,
    status: "Pending",
    totalBytesWritten: 0,
    totalBytesExpectedToWrite: 0,
    createdAt: "2026-06-04T10:00:00.000Z",
    updatedAt: "2026-06-04T10:00:00.000Z",
    ...overrides,
  };
}

function renderCard(task: DownloadTask) {
  const callbacks = {
    onOpen: jest.fn(),
    onPause: jest.fn(),
    onResume: jest.fn(),
    onRetry: jest.fn(),
    onVerify: jest.fn(),
    onRepairBridge: jest.fn(),
    onManageStorage: jest.fn(),
    onDelete: jest.fn(),
  };
  return {
    ...render(<DownloadQueueCard task={task} {...callbacks} />),
    callbacks,
  };
}

describe("DownloadQueueCard", () => {
  it("shows direct pause and delete controls for an active download", () => {
    const { getByLabelText, getByText, callbacks } = renderCard(
      makeTask("downloading", {
        status: "Downloading",
        progress: 0.25,
      }),
    );

    expect(getByText("Downloading")).toBeTruthy();
    expect(getByText("25%")).toBeTruthy();

    fireEvent.press(getByLabelText("Pause"));
    fireEvent.press(getByLabelText("Delete download"));

    expect(callbacks.onPause).toHaveBeenCalledTimes(1);
    expect(callbacks.onDelete).toHaveBeenCalledTimes(1);
  });

  it("shows retry and the persisted error for a failed download", () => {
    const { getByLabelText, getByText, callbacks } = renderCard(
      makeTask("failed", {
        status: "Error",
        error: "Connection was interrupted.",
      }),
    );

    expect(getByText("Needs attention")).toBeTruthy();
    expect(
      getByText("The transfer stopped before the file was ready offline."),
    ).toBeTruthy();

    fireEvent.press(getByLabelText("Resume"));

    expect(callbacks.onRetry).toHaveBeenCalledTimes(1);
  });

  it("only offers play for a verified offline file", () => {
    const { getByLabelText, getByText, callbacks } = renderCard(
      makeTask("ready", {
        status: "Completed",
        localUri: "file:///downloads/ready.mp4",
        offlineVerifiedAt: "2026-06-04T10:05:00.000Z",
      }),
    );

    expect(getByText("Ready offline")).toBeTruthy();

    fireEvent.press(getByLabelText("Play"));

    expect(callbacks.onOpen).toHaveBeenCalledTimes(1);
  });

  it("offers verification for a completed file that is not offline-verified yet", () => {
    const { getByLabelText, getByText, callbacks } = renderCard(
      makeTask("unverified", {
        status: "Completed",
        localUri: "file:///downloads/unverified.mp4",
      }),
    );

    expect(getByText("Needs verification")).toBeTruthy();

    fireEvent.press(getByLabelText("Verify file"));

    expect(callbacks.onVerify).toHaveBeenCalledTimes(1);
    expect(callbacks.onOpen).not.toHaveBeenCalled();
  });

  it("routes bridge failures to the bridge repair action", () => {
    const { getByLabelText, getByText, callbacks } = renderCard(
      makeTask("bridge", {
        status: "Error",
        error: "Desktop bridge unavailable.",
        failureReason: "bridge_unavailable",
      }),
    );

    expect(
      getByText(
        "Reconnect or repair the desktop bridge before retrying this download.",
      ),
    ).toBeTruthy();
    fireEvent.press(getByLabelText("Repair bridge"));
    expect(callbacks.onRepairBridge).toHaveBeenCalledTimes(1);
    expect(callbacks.onRetry).not.toHaveBeenCalled();
  });

  it("routes storage pressure to managed storage", () => {
    const { getByLabelText, callbacks } = renderCard(
      makeTask("storage", {
        status: "Error",
        error: "ENOSPC",
        failureReason: "storage_pressure",
      }),
    );

    fireEvent.press(getByLabelText("Free space"));
    expect(callbacks.onManageStorage).toHaveBeenCalledTimes(1);
  });
});
