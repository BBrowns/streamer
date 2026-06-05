import { useMemo, useState } from "react";
import { Platform } from "react-native";

type KeyboardLikeEvent = {
  key?: string;
  preventDefault?: () => void;
  stopPropagation?: () => void;
  nativeEvent?: {
    key?: string;
    preventDefault?: () => void;
    stopPropagation?: () => void;
  };
};

export function isKeyboardActivationEvent(event: KeyboardLikeEvent) {
  const key = event.nativeEvent?.key ?? event.key;
  return key === "Enter" || key === " " || key === "Spacebar";
}

export function handleKeyboardActivation(
  event: KeyboardLikeEvent,
  onActivate: () => void,
) {
  if (!isKeyboardActivationEvent(event)) return false;

  event.preventDefault?.();
  event.stopPropagation?.();
  event.nativeEvent?.preventDefault?.();
  event.nativeEvent?.stopPropagation?.();
  onActivate();
  return true;
}

export function useWebPressableActivation(onActivate: () => void) {
  const [isKeyboardFocused, setIsKeyboardFocused] = useState(false);

  const webPressableProps = useMemo(() => {
    if (Platform.OS !== "web") return {};

    return {
      focusable: true,
      tabIndex: 0 as const,
      onFocus: () => setIsKeyboardFocused(true),
      onBlur: () => setIsKeyboardFocused(false),
      onKeyDown: (event: KeyboardLikeEvent) =>
        handleKeyboardActivation(event, onActivate),
    };
  }, [onActivate]);

  return {
    isKeyboardFocused,
    webPressableProps,
  };
}
