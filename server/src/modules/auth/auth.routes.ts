import { Hono } from "hono";
import { HonoEnv } from "../../types/hono.js";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { authController } from "./auth.controller.js";
import { authRateLimiter } from "../../middleware/rateLimiter.middleware.js";
import { authMiddleware } from "../../middleware/auth.middleware.js";
import {
  registerRequestSchema,
  loginRequestSchema,
  refreshRequestSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
  updateProfileSchema,
  verifyEmailSchema,
  resendVerificationSchema,
} from "@streamer/shared";

export const authRouter = new Hono<HonoEnv>();

const sessionIdParamSchema = z.object({
  id: z
    .string()
    .trim()
    .min(1)
    .max(128)
    .regex(/^[A-Za-z0-9_-]+$/),
});

const routes = authRouter
  .post(
    "/register",
    authRateLimiter,
    zValidator("json", registerRequestSchema),
    (c) => authController.register(c),
  )
  .post(
    "/login",
    authRateLimiter,
    zValidator("json", loginRequestSchema),
    (c) => authController.login(c),
  )
  .post(
    "/refresh",
    authRateLimiter,
    zValidator("json", refreshRequestSchema),
    (c) => authController.refresh(c),
  )
  .post(
    "/forgot-password",
    authRateLimiter,
    zValidator("json", forgotPasswordSchema),
    (c) => authController.forgotPassword(c),
  )
  .post(
    "/reset-password",
    authRateLimiter,
    zValidator("json", resetPasswordSchema),
    (c) => authController.resetPassword(c),
  )
  .post(
    "/verify-email",
    authRateLimiter,
    zValidator("json", verifyEmailSchema),
    (c) => authController.verifyEmail(c),
  )
  .post(
    "/resend-verification",
    authRateLimiter,
    zValidator("json", resendVerificationSchema),
    (c) => authController.resendVerification(c),
  )
  .post(
    "/change-password",
    authMiddleware,
    zValidator("json", changePasswordSchema),
    (c) => authController.changePassword(c),
  )
  .patch(
    "/profile",
    authMiddleware,
    zValidator("json", updateProfileSchema),
    (c) => authController.updateProfile(c),
  )
  .get("/sessions", authMiddleware, (c) => authController.getSessions(c))
  .delete(
    "/sessions/:id",
    authMiddleware,
    zValidator("param", sessionIdParamSchema),
    (c) => authController.revokeSession(c),
  )
  .delete("/account", authMiddleware, (c) => authController.deleteAccount(c))
  .get("/export", authMiddleware, (c) => authController.exportData(c));

export type AuthRoutes = typeof routes;
