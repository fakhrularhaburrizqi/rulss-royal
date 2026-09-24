import { describe, it, expect } from "vitest";
import { validateSameTenant, assertSameTenant } from "../../lib/helpers/tenant-isolation";

describe("Tenant Isolation Helper", () => {
  it("should return true when tenants match", () => {
    const a = { tenantId: "tenant-1" };
    const b = { tenantId: "tenant-1" };
    expect(validateSameTenant(a, b)).toBe(true);
    expect(() => assertSameTenant(a, b)).not.toThrow();
  });

  it("should return false and throw when tenants mismatch", () => {
    const a = { tenantId: "tenant-1" };
    const b = { tenantId: "tenant-2" };
    expect(validateSameTenant(a, b)).toBe(false);
    expect(() => assertSameTenant(a, b)).toThrowError(/Cross-tenant relation violation/);
  });
});
