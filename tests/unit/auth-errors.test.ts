import { describe, it, expect } from "vitest";
import {
  getGenericAuthErrorMessage,
  getServerAuthErrorMessage,
  AUTH_ERROR_MESSAGES,
} from "@/lib/auth/errors";

describe("Auth Errors", () => {
  it("should return the exact secure generic error message for credentials", () => {
    const msg = getGenericAuthErrorMessage();
    expect(msg).toBe(AUTH_ERROR_MESSAGES.INVALID_CREDENTIALS);
    expect(msg).toBe("Kode tenant, email, atau kata sandi tidak valid.");
  });

  it("should return the server error message", () => {
    const msg = getServerAuthErrorMessage();
    expect(msg).toBe(AUTH_ERROR_MESSAGES.SERVER_ERROR);
    expect(msg).toBe("Terjadi kesalahan. Silakan coba lagi.");
  });
});
