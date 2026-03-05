import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

const isNative = Platform.OS !== "web";

export const hapticSelection = () => {
  if (isNative) {
    Haptics.selectionAsync().catch(() => {});
  }
};

export const hapticImpactLight = () => {
  if (isNative) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }
};

export const hapticImpactMedium = () => {
  if (isNative) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  }
};

export const hapticImpactHeavy = () => {
  if (isNative) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
  }
};

export const hapticSuccess = () => {
  if (isNative) {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
      () => {},
    );
  }
};

export const hapticWarning = () => {
  if (isNative) {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(
      () => {},
    );
  }
};

export const hapticError = () => {
  if (isNative) {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(
      () => {},
    );
  }
};
