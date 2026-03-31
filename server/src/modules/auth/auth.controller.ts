import type { Context } from "hono";
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
import { env } from "../../config/env.js";
import { authService } from "./auth.service.js";
import { SessionService } from "./session.service.js";

export class AuthController {
  async register(c: Context) {
    const body = await c.req.json();
    const data = registerRequestSchema.parse(body);
    const result = await authService.register(
      data.email,
      data.password,
      data.displayName,
    );
    return c.json(result, 201);
  }

  async login(c: Context) {
    const body = await c.req.json();
    const data = loginRequestSchema.parse(body);
    const result = await authService.login(data.email, data.password);
    return c.json(result);
  }

  async refresh(c: Context) {
    const body = await c.req.json();
    const data = refreshRequestSchema.parse(body);
    const tokens = await authService.refresh(data.refreshToken);
    return c.json(tokens);
  }

  async forgotPassword(c: Context) {
    const body = await c.req.json();
    const data = forgotPasswordSchema.parse(body);
    const result = await authService.forgotPassword(data.email);

    return c.json({
      message:
        "If an account with that email exists, a reset token has been generated.",
      ...(env.nodeEnv !== "production" && result.resetToken
        ? { resetToken: result.resetToken }
        : {}),
    });
  }

  async resetPassword(c: Context) {
    const body = await c.req.json();
    const data = resetPasswordSchema.parse(body);
    await authService.resetPassword(data.token, data.newPassword);
    return c.json({ message: "Password reset successfully. Please log in." });
  }

  async changePassword(c: Context) {
    const body = await c.req.json();
    const data = changePasswordSchema.parse(body);
    const user = c.get("user");
    await authService.changePassword(
      user.userId,
      data.currentPassword,
      data.newPassword,
    );
    return c.json({ message: "Password changed successfully" });
  }

  async updateProfile(c: Context) {
    const body = await c.req.json();
    const data = updateProfileSchema.parse(body);
    const user = c.get("user");
    const updatedUser = await authService.updateProfile(user.userId, data);
    return c.json({ user: updatedUser });
  }

  async getSessions(c: Context) {
    const user = c.get("user");
    const sessions = await SessionService.getActiveSessions(user.userId);
    return c.json({ sessions });
  }

  async revokeSession(c: Context) {
    const user = c.get("user");
    const sessionId = c.req.param("id");
    if (!sessionId) return c.json({ error: "Session ID required" }, 400);
    await SessionService.revoke(user.userId, sessionId);
    return c.json({ status: "revoked" });
  }

  async verifyEmail(c: Context) {
    const body = await c.req.json();
    const { token } = verifyEmailSchema.parse(body);
    await authService.verifyEmail(token);
    return c.json({
      message: "Email verified successfully. You can now log in.",
    });
  }

  async resendVerification(c: Context) {
    const body = await c.req.json();
    const { email } = resendVerificationSchema.parse(body);
    await authService.resendVerification(email);
    return c.json({
      message: "If the email is unverified, a new link has been sent.",
    });
  }

  async deleteAccount(c: Context) {
    const user = c.get("user");
    await authService.deleteAccount(user.userId);
    return c.json({ message: "Account deleted successfully" });
  }

  async exportData(c: Context) {
    const user = c.get("user");
    const data = await authService.exportData(user.userId);
    return c.json(data);
  }
}

export const authController = new AuthController();
