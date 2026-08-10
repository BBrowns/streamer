import type { ExpoVideoPlayerLike } from "./ExpoVideoAdapterBase";
import {
  WebVideoAdapter,
  type WebVideoAdapterOptions,
} from "./WebVideoAdapter";

/**
 * Electron currently renders the Expo web player. Keeping an explicit adapter
 * target lets capability policy distinguish desktop without putting Electron
 * IPC or platform checks into the application-facing media port.
 */
export class ElectronVideoAdapter extends WebVideoAdapter {
  constructor(
    player: ExpoVideoPlayerLike,
    options: WebVideoAdapterOptions = {},
  ) {
    super(player, options, "electron");
  }
}
