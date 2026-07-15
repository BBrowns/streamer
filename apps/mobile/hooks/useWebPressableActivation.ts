import { useEffect, useMemo, useState } from "react";
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

type FocusLikeEvent = {
  currentTarget?: {
    matches?: (selector: string) => boolean;
  };
  target?: {
    matches?: (selector: string) => boolean;
  };
};

type WebInputModality = "keyboard" | "pointer";

let fallbackInputModality: WebInputModality = "keyboard";
let trackedDocument: Document | null = null;

export function setWebInputModality(modality: WebInputModality) {
  fallbackInputModality = modality;
  if (typeof document !== "undefined") {
    document.documentElement.classList.toggle(
      "streamer-keyboard-input",
      modality === "keyboard",
    );
  }
}

export function installWebInputModalityTracking() {
  if (
    Platform.OS !== "web" ||
    typeof document === "undefined" ||
    trackedDocument === document
  ) {
    return;
  }

  trackedDocument = document;
  document.addEventListener(
    "keydown",
    (event) => {
      if (!event.altKey && !event.ctrlKey && !event.metaKey) {
        setWebInputModality("keyboard");
      }
    },
    true,
  );
  for (const eventName of ["pointerdown", "mousedown", "touchstart"] as const) {
    document.addEventListener(
      eventName,
      () => setWebInputModality("pointer"),
      true,
    );
  }
  setWebInputModality(fallbackInputModality);
}

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

/**
 * Browsers expose the input-modality-aware `:focus-visible` selector on the
 * focused element. Test renderers and older web runtimes do not, so they keep
 * the previous accessible fallback and show the focus treatment.
 */
export function isFocusVisibleEvent(event?: unknown) {
  const focusEvent = event as FocusLikeEvent | undefined;
  const element = focusEvent?.currentTarget ?? focusEvent?.target;
  if (typeof element?.matches !== "function") {
    return fallbackInputModality === "keyboard";
  }

  try {
    return element.matches(":focus-visible");
  } catch {
    return fallbackInputModality === "keyboard";
  }
}

export function useWebPressableActivation(onActivate: () => void) {
  const [isKeyboardFocused, setIsKeyboardFocused] = useState(false);

  useEffect(() => {
    installWebInputModalityTracking();
  }, []);

  const webPressableProps = useMemo(() => {
    if (Platform.OS !== "web") return {};

    return {
      focusable: true,
      tabIndex: 0 as const,
      onPointerDown: () => {
        setWebInputModality("pointer");
        setIsKeyboardFocused(false);
      },
      onFocus: (event: any) => setIsKeyboardFocused(isFocusVisibleEvent(event)),
      onBlur: () => setIsKeyboardFocused(false),
      onKeyDown: (event: KeyboardLikeEvent) => {
        setWebInputModality("keyboard");
        return handleKeyboardActivation(event, onActivate);
      },
    };
  }, [onActivate]);

  return {
    isKeyboardFocused,
    webPressableProps,
  };
}
