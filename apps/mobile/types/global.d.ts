import type { DesktopBridge } from "../services/desktop-bridge";

declare global {
  interface Window {
    desktopBridge?: DesktopBridge;
  }
}

export {};
