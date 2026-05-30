const mockRegisterPost = jest.fn();
const mockLoginPost = jest.fn();
const mockForgotPost = jest.fn();
const mockResetPost = jest.fn();
const mockVerifyPost = jest.fn();
const mockResendPost = jest.fn();
const mockGetApiClient = jest.fn(() => ({
  api: {
    auth: {
      register: { $post: mockRegisterPost },
      login: { $post: mockLoginPost },
      "forgot-password": { $post: mockForgotPost },
      "reset-password": { $post: mockResetPost },
      "verify-email": { $post: mockVerifyPost },
      "resend-verification": { $post: mockResendPost },
    },
  },
}));

jest.mock("../api-client", () => ({
  __esModule: true,
  getApiClient: mockGetApiClient,
}));

const { authService } = require("../authService");

const response = (ok: boolean, payload: unknown) =>
  ({
    ok,
    json: jest.fn().mockResolvedValue(payload),
  }) as any;

describe("authService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("uses the dynamic API client for login and registration", async () => {
    mockRegisterPost.mockResolvedValueOnce(
      response(true, { user: { id: "u1" }, verificationRequired: true }),
    );
    mockLoginPost.mockResolvedValueOnce(
      response(true, {
        user: { id: "u1" },
        tokens: { accessToken: "access", refreshToken: "refresh" },
      }),
    );

    await authService.register({
      email: "a@example.com",
      password: "Password123",
    });
    await authService.login({
      email: "a@example.com",
      password: "Password123",
    });

    expect(mockGetApiClient).toHaveBeenCalledTimes(2);
    expect(mockRegisterPost).toHaveBeenCalledWith({
      json: { email: "a@example.com", password: "Password123" },
    });
    expect(mockLoginPost).toHaveBeenCalledWith({
      json: { email: "a@example.com", password: "Password123" },
    });
  });

  it("calls dashed auth routes with bracket notation", async () => {
    mockForgotPost.mockResolvedValueOnce(
      response(true, { message: "sent", resetToken: "token-1" }),
    );
    mockResetPost.mockResolvedValueOnce(response(true, { message: "reset" }));
    mockVerifyPost.mockResolvedValueOnce(
      response(true, { message: "verified" }),
    );
    mockResendPost.mockResolvedValueOnce(response(true, { message: "resent" }));

    await authService.forgotPassword({ email: "a@example.com" });
    await authService.resetPassword({
      token: "token-1",
      newPassword: "Password123",
    });
    await authService.verifyEmail({ token: "token-2" });
    await authService.resendVerification({ email: "a@example.com" });

    expect(mockForgotPost).toHaveBeenCalledWith({
      json: { email: "a@example.com" },
    });
    expect(mockResetPost).toHaveBeenCalledWith({
      json: { token: "token-1", newPassword: "Password123" },
    });
    expect(mockVerifyPost).toHaveBeenCalledWith({ json: { token: "token-2" } });
    expect(mockResendPost).toHaveBeenCalledWith({
      json: { email: "a@example.com" },
    });
  });

  it("surfaces server validation messages", async () => {
    mockRegisterPost.mockResolvedValueOnce(
      response(false, {
        error: "Validation failed",
        details: [{ message: "Password must contain at least one digit" }],
      }),
    );

    await expect(
      authService.register({
        email: "a@example.com",
        password: "Password",
      }),
    ).rejects.toThrow("Password must contain at least one digit");
  });
});
