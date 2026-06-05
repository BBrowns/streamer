import pino from "pino";
import { env } from "./env.js";
import { getRequestId } from "../utils/request-context.js";
import { redactSensitiveLogValue } from "../utils/redaction.js";

export const logger = pino({
  level: env.logLevel,
  transport:
    env.nodeEnv === "development"
      ? { target: "pino-pretty", options: { colorize: true } }
      : undefined,
  base: { service: "streamer-server" },
  timestamp: pino.stdTimeFunctions.isoTime,
  mixin() {
    const requestId = getRequestId();
    return requestId ? { requestId } : {};
  },
  hooks: {
    logMethod(args, method) {
      method.apply(
        this,
        args.map((arg) => redactSensitiveLogValue(arg)) as any,
      );
    },
  },
});
