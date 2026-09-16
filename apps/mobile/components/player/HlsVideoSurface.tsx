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
    return () => {
      adapter.clearSource();
      adapter.unmount();
    };
  }, [adapter]);

  useEffect(() => {
    if (source) {
      void adapter.replaceSource(source);
    } else {
      adapter.clearSource();
    }

    return () => {
      // A fallback or route change can remove the URI while an earlier
      // dynamic HLS import/request is still unwinding. Clear the generation
      // before the next source is attached so stale events cannot fail the
      // replacement candidate.
      adapter.clearSource();
    };
  }, [adapter, source]);

  if (Platform.OS !== "web") return <View style={style as any} />;

  // Chromium can retain a transient HTMLMediaElement error in its
  // accessibility tree after HLS.js has recovered and playback is already
  // progressing. The custom player controls and status surface own the
  // accessible interaction, so keep the raw media element out of the tree and
  // expose one stable, named surface instead.
  return React.createElement(
    "div",
    {
      style,
      role: "group",
      "aria-label": "Video player",
    },
    React.createElement("video", {
      ref: videoRef,
      style: { width: "100%", height: "100%", display: "block" },
      playsInline: true,
      preload: "auto",
      "aria-hidden": true,
    }),
  );
}
