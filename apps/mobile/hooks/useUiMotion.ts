import { useReducedMotion } from "./useReducedMotion";
import {
  resolveMotionDuration,
  type UiMotionIntent,
} from "../components/ui/designSystem";

export function useUiMotion() {
  const reducedMotion = useReducedMotion();

  return {
    reducedMotion,
    duration: (intent: UiMotionIntent) =>
      resolveMotionDuration(intent, reducedMotion),
    allowSpatialMotion: !reducedMotion,
    allowContinuousMotion: !reducedMotion,
  };
}
