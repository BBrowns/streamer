import React from "react";
import { Platform } from "react-native";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import DownloadsScreen from "../downloads";
import { clearPendingUndoableActionsForTests } from "../../../services/undoableAction";

const mockPush = jest.fn();

const mockReadyTask = {
  id: "download-episode-1",
  mediaInfo: {
    itemId: "series-1",
    type: "series",
    title: "Example Episode",
    season: 1,
    episode: 1,
  },
  progress: 1,
  status: "Completed",
  downloadedBytes: 20_000_000,
  expectedMediaBytes: 20_000_000,
  verifiedFileSizeBytes: 20_000_000,
  verificationState: "verified",
  playableState: "playable",
  localUri: "streamer:///downloads/episode-1.mp4",
  offlineVerifiedAt: "2026-07-15T00:00:00.000Z",
  createdAt: "2026-07-15T00:00:00.000Z",
  updatedAt: "2026-07-15T00:00:00.000Z",
};

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock("../../../stores/downloadStore", () => ({
  useDownloadStore: (
    selector: (state: {
      tasks: Record<string, typeof mockReadyTask>;
    }) => unknown,
  ) => selector({ tasks: { [mockReadyTask.id]: mockReadyTask } }),
  isTaskOfflinePlayable: (task: typeof mockReadyTask) =>
    task.status === "Completed" &&
    task.verificationState === "verified" &&
    task.playableState === "playable" &&
    Boolean(task.localUri),
}));

jest.mock("../../../services/DownloadService", () => ({
  downloadService: {
    refreshQueue: jest.fn().mockResolvedValue(undefined),
    deleteDownload: jest.fn().mockResolvedValue({ ok: true }),
    pauseDownload: jest.fn(),
    resumeDownload: jest.fn(),
    verifyTask: jest.fn(),
  },
}));

const mockDownloadService = jest.requireMock(
  "../../../services/DownloadService",
).downloadService as {
  refreshQueue: jest.Mock;
  deleteDownload: jest.Mock;
};

jest.mock("../../../stores/playerStore", () => ({
  usePlayerStore: { getState: () => ({ setStream: jest.fn() }) },
}));

jest.mock("../../../stores/toastStore", () => ({
  useToastStore: { getState: () => ({ show: jest.fn() }) },
}));

jest.mock("../../../hooks/useTheme", () => ({
  useTheme: () => ({
    isDark: true,
    colors: {
      background: "#08090c",
      surfaceElevated: "#181b21",
      border: "#2a2d35",
      text: "#f4f5f7",
      textSecondary: "#9da3ae",
      tint: "#6c79f5",
      success: "#4caf7d",
      warning: "#d7a84f",
    },
  }),
}));

jest.mock("../../../hooks/useWindowClass", () => ({
  useWindowClass: () => ({ isCompact: false }),
}));

jest.mock("../../../lib/haptics", () => ({
  hapticImpactLight: jest.fn(),
}));

jest.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));

jest.mock("../../../components/downloads/SmartDownloadsStatus", () => ({
  SmartDownloadsStatusRow: () => null,
  SmartDownloadPlans: () => null,
}));

jest.mock("../../../components/downloads/DownloadQueueCard", () => {
  const { Pressable: MockPressable, Text: MockText } = require("react-native");
  return {
    DownloadQueueCard: ({
      task,
      isSelected,
      onToggleSelect,
    }: {
      task: typeof mockReadyTask;
      isSelected: boolean;
      onToggleSelect: () => void;
    }) => (
      <MockPressable
        accessibilityLabel={`card-${task.id}`}
        onPress={onToggleSelect}
      >
        <MockText>{task.mediaInfo.title}</MockText>
        {isSelected ? <MockText>Selected download</MockText> : null}
      </MockPressable>
    ),
  };
});

jest.mock("../../../components/ui/FilterChipBar", () => {
  const {
    Pressable: MockPressable,
    Text: MockText,
    View: MockView,
  } = require("react-native");
  return {
    FilterChipBar: ({
      options,
      onChange,
    }: {
      options: { label: string; value: string }[];
      onChange: (value: string) => void;
    }) => (
      <MockView>
        {options.map((option) => (
          <MockPressable
            key={option.value}
            accessibilityLabel={`filter-${option.value}`}
            onPress={() => onChange(option.value)}
          >
            <MockText>{option.label}</MockText>
          </MockPressable>
        ))}
      </MockView>
    ),
  };
});

jest.mock("../../../components/ui/AppButton", () => {
  const { Pressable: MockPressable, Text: MockText } = require("react-native");
  return {
    AppButton: ({
      label,
      accessibilityLabel,
      onPress,
    }: {
      label: string;
      accessibilityLabel?: string;
      onPress: () => void;
    }) => (
      <MockPressable
        accessibilityLabel={accessibilityLabel ?? label}
        onPress={onPress}
      >
        <MockText>{label}</MockText>
      </MockPressable>
    ),
  };
});

jest.mock("../../../components/ui/Surface", () => {
  const { View: MockView } = require("react-native");
  return {
    Surface: ({ children }: { children: React.ReactNode }) => (
      <MockView>{children}</MockView>
    ),
  };
});

jest.mock("../../../components/ui/EmptyState", () => {
  const { Text: MockText } = require("react-native");
  return {
    EmptyState: ({ title }: { title: string }) => <MockText>{title}</MockText>,
  };
});

jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { count?: number; defaultValue?: string }) => {
      const labels: Record<string, string> = {
        "library.header.select": "Select",
        "library.header.cancel": "Cancel",
        "downloads.actions.delete": "Delete",
      };
      if (key === "downloads.selection.selected") {
        return `${options?.count ?? 0} selected`;
      }
      if (key === "downloads.selection.deleteSelected") {
        return "Delete selected downloads";
      }
      return labels[key] ?? options?.defaultValue ?? key;
    },
  }),
  initReactI18next: { type: "3rdParty", init: jest.fn() },
}));

describe("DownloadsScreen selection", () => {
  const originalPlatform = Platform.OS;

  beforeEach(() => {
    jest.clearAllMocks();
    clearPendingUndoableActionsForTests();
    Object.defineProperty(Platform, "OS", { configurable: true, value: "web" });
    window.confirm = jest.fn(() => true);
  });

  afterEach(() => {
    clearPendingUndoableActionsForTests();
    jest.useRealTimers();
    Object.defineProperty(Platform, "OS", {
      configurable: true,
      value: originalPlatform,
    });
  });

  it("hides the action bar at zero and clears selection on Cancel and filters", async () => {
    const screen = render(<DownloadsScreen />);
    await waitFor(() =>
      expect(mockDownloadService.refreshQueue).toHaveBeenCalled(),
    );

    expect(screen.queryByText("0 selected")).toBeNull();
    fireEvent.press(screen.getByText("Select"));
    fireEvent.press(screen.getByLabelText("card-download-episode-1"));
    expect(screen.getByText("1 selected")).toBeTruthy();

    fireEvent.press(screen.getByText("Cancel"));
    expect(screen.queryByText("1 selected")).toBeNull();

    fireEvent.press(screen.getByText("Select"));
    fireEvent.press(screen.getByLabelText("card-download-episode-1"));
    fireEvent.press(screen.getByLabelText("filter-ready"));
    await waitFor(() => expect(screen.queryByText("1 selected")).toBeNull());
    expect(screen.getByText("Select")).toBeTruthy();

    fireEvent.press(screen.getByLabelText("filter-attention"));
    await waitFor(() => expect(screen.queryByText("Select")).toBeNull());
  });

  it("defers bulk deletion for exactly seven seconds", async () => {
    jest.useFakeTimers();
    const screen = render(<DownloadsScreen />);

    fireEvent.press(screen.getByText("Select"));
    fireEvent.press(screen.getByLabelText("card-download-episode-1"));
    fireEvent.press(screen.getByLabelText("Delete selected downloads"));

    expect(mockDownloadService.deleteDownload).not.toHaveBeenCalled();
    act(() => jest.advanceTimersByTime(6_999));
    expect(mockDownloadService.deleteDownload).not.toHaveBeenCalled();
    await act(async () => {
      jest.advanceTimersByTime(1);
      await Promise.resolve();
    });

    expect(mockDownloadService.deleteDownload).toHaveBeenCalledWith(
      "download-episode-1",
    );
  });
});
