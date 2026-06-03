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
    resolveEngine: jest.fn(() => ({ getEngineType: () => "torrent" })),
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

  it("does not resolve playback URLs while rendering stream metadata", () => {
    render(
      <StreamItem
        stream={{ infoHash: "abc123", title: "Torrent source" }}
        index={0}
        onPress={jest.fn()}
        onDownload={jest.fn()}
      />,
    );

    expect(streamEngineManager.getPlaybackUri).not.toHaveBeenCalled();
  });

  it("shows preparing state for downloads before progress starts", () => {
    useDownloadStore.getState().addTask("abc123", {
      type: "movie",
      itemId: "tt123",
      title: "Example Movie",
      downloadUrl: "https://cdn.example.test/movie.mp4",
      sourceId: "abc123",
    });
    useDownloadStore.getState().setStatus("abc123", "Preparing");

    const { getByText } = render(
      <StreamItem
        stream={{ infoHash: "abc123", title: "Torrent source" }}
        index={0}
        onPress={jest.fn()}
        onDownload={jest.fn()}
      />,
    );

    expect(getByText("Prep")).toBeTruthy();
  });
});
