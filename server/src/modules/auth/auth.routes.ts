import { Hono } from "hono";
import { authController } from "./auth.controller.js";
import { authRateLimiter } from "../../middleware/rateLimiter.middleware.js";
import { authMiddleware } from "../../middleware/auth.middleware.js";

export const authRouter = new Hono();

authRouter.post("/register", authRateLimiter, (c) =>
  authController.register(c),
);
authRouter.post("/login", authRateLimiter, (c) => authController.login(c));
authRouter.post("/refresh", authRateLimiter, (c) => authController.refresh(c));
authRouter.post("/forgot-password", authRateLimiter, (c) =>
  authController.forgotPassword(c),
);
authRouter.post("/reset-password", authRateLimiter, (c) =>
  authController.resetPassword(c),
);

authRouter.use("/change-password", authMiddleware);
authRouter.post("/change-password", (c) => authController.changePassword(c));

authRouter.use("/profile", authMiddleware);
authRouter.patch("/profile", (c) => authController.updateProfile(c));
