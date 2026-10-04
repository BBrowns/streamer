import { useEffect, useRef } from "react";
import { Platform, View } from "react-native";
import { useRouter } from "expo-router";
import { usePlayerStore } from "../../stores/playerStore";

export default function PlayerFixtureRoute() {
  const router = useRouter();
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    if (!__DEV__ || process.env.EXPO_PUBLIC_STREAMER_E2E !== "true") {
      router.replace("/(tabs)");
      return;
    }

    const host = Platform.OS === "android" ? "10.0.2.2" : "127.0.0.1";
    usePlayerStore.getState().setStream(
      {
        url: `http://${host}:18777/index.m3u8`,
        title: "Title-wide seek fixture",
      },
      {
        type: "movie",
        itemId: "e2e-title-wide-seek",
        title: "Title-wide seek fixture",
        durationHintSeconds: 540,
      },
    );
    router.replace("/player");
  }, [router]);

  return <View testID="player-fixture-starting" />;
}
