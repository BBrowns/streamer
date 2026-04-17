import nodemailer from "nodemailer";
import { env } from "../config/env";
import { logger } from "../config/logger";

class EmailService {
  private transporter: nodemailer.Transporter | null = null;

  constructor() {
    if (env.smtp?.host && env.smtp?.user && env.smtp?.pass) {
      this.transporter = nodemailer.createTransport({
        host: env.smtp.host,
        port: env.smtp.port,
        secure: env.smtp.port === 465, // true for 465, false for other ports
        auth: {
          user: env.smtp.user,
          pass: env.smtp.pass,
        },
      });
      logger.info("📧 Email Service: SMTP transporter initialized");
    } else {
      logger.warn(
        "📧 Email Service: SMTP not configured. Emails will be logged to console.",
      );
    }
  }

  async sendEmail(to: string, subject: string, html: string, text: string) {
    if (this.transporter) {
      try {
        await this.transporter.sendMail({
          from: env.smtp.from,
          to,
          subject,
          text,
          html,
        });
        logger.info(`📧 Email sent to ${to}: ${subject}`);
      } catch (error) {
        logger.error({ error }, `❌ Failed to send email to ${to}`);
        throw error;
      }
    } else {
      logger.info("--- [DEBUG EMAIL START] ---");
      logger.info(`To: ${to}`);
      logger.info(`Subject: ${subject}`);
      logger.info(`Text: ${text}`);
      logger.info("--- [DEBUG EMAIL END] ---");
    }
  }

  /** Send password reset email */
  async sendPasswordResetEmail(to: string, token: string) {
    const resetUrl = `${env.appUrlDeepLink}reset-password?token=${token}`;
    const webResetUrl = `${env.appUrlWeb}/reset-password?token=${token}`;

    const subject = "Reset Your Streamer Password";
    const text = `You requested a password reset. Use this link to reset your password: ${resetUrl} or ${webResetUrl}`;
    const html = `
      <div style="font-family: sans-serif; padding: 20px; color: #333;">
        <h2>Reset Your Password</h2>
        <p>You requested a password reset for your Streamer account.</p>
        <p>Click the button below to set a new password:</p>
        <a href="${webResetUrl}" style="display: inline-block; padding: 12px 24px; background-color: #818cf8; color: white; text-decoration: none; border-radius: 8px; font-weight: bold;">Reset Password</a>
        <p style="margin-top: 20px; font-size: 12px; color: #666;">
          If you're on mobile, <a href="${resetUrl}">click here to open the app</a>.
        </p>
        <p>If you didn't request this, you can safely ignore this email.</p>
      </div>
    `;

    await this.sendEmail(to, subject, html, text);
  }

  /** Send email verification email */
  async sendVerificationEmail(to: string, token: string) {
    const verifyUrl = `${env.appUrlWeb}/api/auth/verify-email?token=${token}`;

    const subject = "Verify Your Streamer Email";
    const text = `Welcome to Streamer! Please verify your email by clicking: ${verifyUrl}`;
    const html = `
      <div style="font-family: sans-serif; padding: 20px; color: #333;">
        <h2>Welcome to Streamer!</h2>
        <p>Thanks for signing up. Please verify your email address to get full access to the app.</p>
        <a href="${verifyUrl}" style="display: inline-block; padding: 12px 24px; background-color: #00f2ff; color: black; text-decoration: none; border-radius: 8px; font-weight: bold;">Verify Email</a>
        <p>If you didn't create an account, you can safely ignore this email.</p>
      </div>
    `;

    await this.sendEmail(to, subject, html, text);
  }
}

export const emailService = new EmailService();
