import { describe, it, expect } from "vitest";
import { loginCredentialsSchema } from "@/lib/validators/auth.validator";

describe("Auth Validator", () => {
  it("should normalize tenantCode and email, and validate correct input", () => {
    const input = {
      tenantCode: "  WARUNG-1  ",
      email: "  ADMIN@WARUNG.COM  ",
      password: "secretpassword",
    };

    const result = loginCredentialsSchema.parse(input);
    expect(result.tenantCode).toBe("warung-1");
    expect(result.email).toBe("admin@warung.com");
    expect(result.password).toBe("secretpassword");
  });

  it("should fail on invalid tenantCode characters or format", () => {
    const invalidCodes = ["Warung 1", "-warung", "warung-", "a", "a".repeat(51)];
    for (const code of invalidCodes) {
      const input = {
        tenantCode: code,
        email: "admin@warung.com",
        password: "secretpassword",
      };
      const parseResult = loginCredentialsSchema.safeParse(input);
      expect(parseResult.success).toBe(false);
    }
  });

  it("should fail on invalid email format", () => {
    const input = {
      tenantCode: "warung-1",
      email: "not-an-email",
      password: "secretpassword",
    };
    expect(() => loginCredentialsSchema.parse(input)).toThrow();
  });

  it("should fail on empty password", () => {
    const input = {
      tenantCode: "warung-1",
      email: "admin@warung.com",
      password: "",
    };
    expect(() => loginCredentialsSchema.parse(input)).toThrow();
  });
});
