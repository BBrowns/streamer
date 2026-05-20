import type { AuthPayload } from "../middleware/auth.middleware.js";

export type HonoEnv = {
  Variables: {
    user: AuthPayload;
    deviceId: string;
    requestId: string;
  };
};
