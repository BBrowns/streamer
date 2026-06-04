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
    expect(getByText("Connection was interrupted.")).toBeTruthy();

    fireEvent.press(getByLabelText("Retry"));

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
});
