import { Platform } from "react-native";
import type { MediaPlayerAdapter } from "../MediaPlayerAdapter";
import { ElectronVideoAdapter } from "./ElectronVideoAdapter";
import type { ExpoVideoPlayerLike } from "./ExpoVideoAdapterBase";
import {
  NativeExpoVideoAdapter,
  type NativeExpoVideoAdapterOptions,
  type NativeMediaPlatform,
} from "./NativeExpoVideoAdapter";
import {
  WebVideoAdapter,
  type WebMediaDocument,
  type WebVideoAdapterOptions,
} from "./WebVideoAdapter";
import { HlsWebVideoAdapter } from "./HlsWebVideoAdapter";

export type MediaPlayerRuntime = NativeMediaPlatform | "web" | "electron";

export interface CreateMediaPlayerAdapterOptions {
  player: ExpoVideoPlayerLike;
  runtime?: MediaPlayerRuntime;
  native?: NativeExpoVideoAdapterOptions;
  web?: Omit<WebVideoAdapterOptions, "document"> & {
    document?: WebMediaDocument;
  };
  /** Opt-in HLS surface for web/Electron; native targets use Expo Video. */
  hls?: boolean;
}

export function detectMediaPlayerRuntime(): MediaPlayerRuntime {
  if (Platform.OS === "ios" || Platform.OS === "android") {
    return Platform.OS;
  }
  if (Platform.OS === "web") {
    return typeof window !== "undefined" && Boolean(window.desktopBridge)
      ? "electron"
      : "web";
  }
  throw new Error(`Unsupported media player platform: ${Platform.OS}`);
}

function defaultWebDocument(): WebMediaDocument | undefined {
  return typeof document === "undefined" ? undefined : document;
}

export function createMediaPlayerAdapter({
  player,
  runtime = detectMediaPlayerRuntime(),
  native,
  web,
  hls = false,
}: CreateMediaPlayerAdapterOptions): MediaPlayerAdapter {
  if (runtime === "ios" || runtime === "android") {
    return new NativeExpoVideoAdapter(player, runtime, native);
  }

  if (hls) {
    return new HlsWebVideoAdapter({
      document: web?.document ?? defaultWebDocument(),
    });
  }

  const webOptions: WebVideoAdapterOptions = {
    ...web,
    document: web?.document ?? defaultWebDocument(),
  };
  return runtime === "electron"
    ? new ElectronVideoAdapter(player, webOptions)
    : new WebVideoAdapter(player, webOptions);
}
