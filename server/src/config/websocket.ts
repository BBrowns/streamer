import { Hono } from "hono";
import { createNodeWebSocket } from "@hono/node-ws";

let _upgradeWebSocket: any;
let _injectWebSocket: any;

/**
 * Stable wrapper for upgradeWebSocket that can be imported before init.
 */
export const upgradeWebSocket: any = (handler: any) => {
  return async (c: any, next: any) => {
    if (!_upgradeWebSocket) {
      throw new Error(
        "WebSocket adapter not initialized. Call initWebSockets(app) first.",
      );
    }
    return _upgradeWebSocket(handler)(c, next);
  };
};

/**
 * Stable wrapper for injectWebSocket.
 */
export const injectWebSocket: any = (server: any) => {
  if (!_injectWebSocket) {
    throw new Error("WebSocket adapter not initialized.");
  }
  return _injectWebSocket(server);
};

export function initWebSockets(app: Hono<any, any, any>) {
  const ws = createNodeWebSocket({ app });
  _upgradeWebSocket = ws.upgradeWebSocket;
  _injectWebSocket = ws.injectWebSocket;
  return ws;
}
