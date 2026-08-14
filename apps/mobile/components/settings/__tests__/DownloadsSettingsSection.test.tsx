import React from "react";
import { fireEvent, render } from "@testing-library/react-native";
import { DownloadsSettingsSection } from "../DownloadsSettingsSection";
import { useSmartDownloadStore } from "../../../stores/smartDownloadStore";

jest.mock("@expo/vector-icons", () => ({
  Ionicons: () => null,
}));

describe("DownloadsSettingsSection", () => {
  beforeEach(() => {
    useSmartDownloadStore.getState().resetSmartDownloads();
  });

  it("owns the editable Smart Downloads preferences", async () => {
    const screen = await render(<DownloadsSettingsSection />);

    const enable = screen.getByLabelText(
      "settings.downloadPreferences.smartDownloads",
    );
    expect(enable).toBeTruthy();
    expect(
      screen.getByText("settings.downloadPreferences.quality"),
    ).toBeTruthy();
    expect(
      screen.getByText("settings.downloadPreferences.storageLimit"),
    ).toBeTruthy();

    await fireEvent(enable, "valueChange", true);

    expect(useSmartDownloadStore.getState().preferences.enabled).toBe(true);
  });
});
