import React, { useEffect, useRef } from "react";
import { Platform, View } from "react-native";
import type { HlsWebVideoAdapter } from "../../services/playback/mediaPlayerAdapters/HlsWebVideoAdapter";

interface HlsVideoSurfaceProps {
  adapter: HlsWebVideoAdapter;
  source: string | null;
  style?: unknown;
}

/** A single owned HTML video surface for the web HLS adapter. */
export function HlsVideoSurface({
  adapter,
  source,
  style,
}: HlsVideoSurfaceProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (Platform.OS !== "web" || !videoRef.current) return;
    adapter.mount(videoRef.current);
    return () => adapter.unmount();
  }, [adapter]);

  useEffect(() => {
    if (source) void adapter.replaceSource(source);
  }, [adapter, source]);

  if (Platform.OS !== "web") return <View style={style as any} />;

  return React.createElement("video", {
    ref: videoRef,
    style,
    playsInline: true,
    preload: "auto",
    "aria-label": "Video player",
  });
}
