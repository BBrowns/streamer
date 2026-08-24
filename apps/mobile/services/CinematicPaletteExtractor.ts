import { getColors, type ImageColorsResult } from "react-native-image-colors";
import type { CinematicImageColorsResult } from "./cinematicTheme";

export interface CinematicPaletteExtractor {
  extract(uri: string, cacheKey: string): Promise<CinematicImageColorsResult>;
}

export class ReactNativeImageColorsExtractor implements CinematicPaletteExtractor {
  async extract(uri: string, cacheKey: string) {
    const result: ImageColorsResult = await getColors(uri, {
      fallback: "#C89B6D",
      cache: false,
      key: cacheKey,
      quality: "low",
      pixelSpacing: 10,
    });
    return result;
  }
}
