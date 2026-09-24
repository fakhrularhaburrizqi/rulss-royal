import { describe, it, expect } from "vitest";
import { createUserSchema } from "../../lib/validators/user.validator";

describe("User Validator", () => {
  it("should normalize email to lowercase and trim whitespace", () => {
    const input = {
      tenantId: "clh1234560000000000000001",
      name: "Budi",
      email: "  BUDI.TEST@EXAMPLE.COM  ",
    };

    const result = createUserSchema.parse(input);
    expect(result.email).toBe("budi.test@example.com");
  });

  it("should fail on invalid email format", () => {
    const input = {
      tenantId: "clh1234560000000000000001",
      name: "Budi",
      email: "invalid-email",
    };

    expect(() => createUserSchema.parse(input)).toThrow();
  });
});
