import { AsyncLocalStorage } from "node:async_hooks";
import { v4 as uuidv4 } from "uuid";

export interface RequestContext {
  requestId: string;
  userId?: string;
}

export const requestContextStorage = new AsyncLocalStorage<RequestContext>();

/** Hook to get the current requestId anywhere in the app */
export function getRequestId(): string | undefined {
  return requestContextStorage.getStore()?.requestId;
}

/** Hook to get the current userId anywhere in the app */
export function getUserId(): string | undefined {
  return requestContextStorage.getStore()?.userId;
}

/** Middleware to wrap request in a context with a stable ID */
export function generateCorrelationId(requestIdFromHono: string) {
  const store: RequestContext = {
    requestId: requestIdFromHono || uuidv4(),
  };
  return store;
}
