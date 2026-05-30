import React from "react";
import { render } from "@testing-library/react-native";
import { StreamItem } from "../StreamItem";
import { streamEngineManager } from "../../../services/streamEngine/StreamEngineManager";

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
});
