import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/services/password.service";

describe("Password Service", () => {
  it("should hash a password and verify it successfully", async () => {
    const password = "mySecurePassword123";
    const hashed = await hashPassword(password);

    expect(hashed).toBeTypeOf("string");
    expect(hashed).not.toBe(password);

    const isValid = await verifyPassword(password, hashed);
    expect(isValid).toBe(true);

    const isInvalid = await verifyPassword("wrongPassword", hashed);
    expect(isInvalid).toBe(false);
  });

  it("should handle invalid inputs gracefully in verification", async () => {
    const isValid = await verifyPassword("", "");
    expect(isValid).toBe(false);
  });
});
