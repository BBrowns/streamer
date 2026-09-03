import React from "react";
import { render } from "@testing-library/react-native";
import { StreamItem } from "../StreamItem";
import { streamEngineManager } from "../../../services/streamEngine/StreamEngineManager";
import { useDownloadStore } from "../../../stores/downloadStore";

jest.mock("../../../lib/haptics", () => ({
  hapticImpactLight: jest.fn(),
}));

jest.mock("@expo/vector-icons", () => ({
  Ionicons: () => null,
}));

jest.mock("../../../services/streamEngine/StreamEngineManager", () => ({
  streamEngineManager: {
    bridgeAvailable: false,
    bridgeStatus: "unreachable",
    getBridgeSnapshot: jest.fn(() => ({
      available: false,
      status: "unreachable",
      diagnostics: { status: "unreachable" },
      url: null,
    })),
    subscribeBridge: jest.fn(() => jest.fn()),
    resolveEngine: jest.fn(() => ({ getEngineType: () => "torrent" })),
    getBridgeUrl: jest.fn(() => "http://192.168.1.25:11470"),
    getPlaybackUri: jest.fn(),
  },
}));

describe("StreamItem", () => {
  beforeEach(() => {
    useDownloadStore.getState().clearAll();
  });

  afterEach(() => {
    useDownloadStore.getState().clearAll();
  });

  it("does not resolve playback URLs while rendering stream metadata", async () => {
    await render(
      <StreamItem
        stream={{ infoHash: "abc123", title: "Torrent source" }}
        index={0}
        onPress={jest.fn()}
        onDownload={jest.fn()}
      />,
    );

    expect(streamEngineManager.getPlaybackUri).not.toHaveBeenCalled();
  });

  it("shows preparing state for downloads before progress starts", async () => {
    useDownloadStore.getState().addTask("abc123", {
      type: "movie",
      itemId: "tt123",
      title: "Example Movie",
      downloadUrl: "https://cdn.example.test/movie.mp4",
      sourceId: "abc123",
    });
    useDownloadStore.getState().setStatus("abc123", "Preparing");

    const { getByText } = await render(
      <StreamItem
        stream={{ infoHash: "abc123", title: "Torrent source" }}
        index={0}
        onPress={jest.fn()}
        onDownload={jest.fn()}
      />,
    );

    expect(getByText("Prep")).toBeTruthy();
  });

  it("shows offline only after the local file has been verified", async () => {
    useDownloadStore.getState().addTask("abc123", {
      type: "movie",
      itemId: "tt123",
      title: "Example Movie",
      downloadUrl: "https://cdn.example.test/movie.mp4",
      sourceId: "abc123",
    });
    useDownloadStore
      .getState()
      .setStatus("abc123", "Completed", "file:///downloads/movie.mp4");

    const unverified = await render(
      <StreamItem
        stream={{ infoHash: "abc123", title: "Torrent source" }}
        index={0}
        onPress={jest.fn()}
        onDownload={jest.fn()}
      />,
    );

    expect(unverified.queryByText("Offline")).toBeNull();
    await unverified.unmount();

    useDownloadStore
      .getState()
      .markVerified("abc123", "file:///downloads/movie.mp4", 2 * 1024 ** 2);

    const verified = await render(
      <StreamItem
        stream={{ infoHash: "abc123", title: "Torrent source" }}
        index={0}
        onPress={jest.fn()}
        onDownload={jest.fn()}
      />,
    );

    expect(verified.getByText("Offline")).toBeTruthy();
  });
});
