import { Platform, NativeModules } from "react-native";
import type React from "react";

export const hasGoogleCast = !!NativeModules.RNGCSessionManager;
export const hasAirPlay = !!NativeModules.RNAirplayBtn;

export let CastButton: React.ComponentType<any> | null = null;
export let useRemoteMediaClient: (() => unknown) | null = null;
export let AirPlayButton: React.ComponentType<any> | null = null;

if (Platform.OS !== "web") {
  if (hasGoogleCast) {
    try {
      const GoogleCast = require("react-native-google-cast");
      CastButton = GoogleCast.CastButton;
      useRemoteMediaClient = GoogleCast.useRemoteMediaClient;
    } catch (e) {
      console.warn("Failed to load react-native-google-cast", e);
    }
  }

  if (hasAirPlay) {
    try {
      const AirPlay = require("react-native-airplay-btn");
      AirPlayButton = AirPlay.AirPlayButton;
    } catch (e) {
      console.warn("Failed to load react-native-airplay-btn", e);
    }
  }
}
