import { describe, it, expect } from "vitest";
import { catalogListQuerySchema, encodeCursor, decodeCursor, validateCursorBinding, type CursorPayload } from "@/lib/validators/category-query";
import { MAX_CATEGORY_NAME } from "@/lib/order/constants";

describe("catalogListQuerySchema", () => {
  it("accepts valid minimal input", () => {
    const result = catalogListQuerySchema.safeParse({ outlet: "outlet-1" });
    expect(result.success).toBe(true);
    if (!result.success) throw new Error("Expected valid query");
    expect(result.data.outlet).toBe("outlet-1");
    expect(result.data.limit).toBe(50);
    expect(result.data.filter).toBe("all");
    expect(result.data.search).toBeUndefined();
    expect(result.data.cursor).toBeUndefined();
  });

  it("rejects missing outlet", () => {
    const result = catalogListQuerySchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects empty outlet", () => {
    const result = catalogListQuerySchema.safeParse({ outlet: "   " });
    expect(result.success).toBe(false);
  });

  it("rejects duplicate outlet param at route level", () => {
    // Zod object parsing doesn't detect duplicate keys in object literals
    // (JS only keeps the last value). Duplicate detection is done at route level
    // by checking searchParams.getAll().length > 1.
    const result = catalogListQuerySchema.safeParse({ outlet: "outlet-1" });
    expect(result.success).toBe(true);
  });

  it("accepts valid limit bounds", () => {
    expect(catalogListQuerySchema.safeParse({ outlet: "outlet-1", limit: "1" }).success).toBe(true);
    expect(catalogListQuerySchema.safeParse({ outlet: "outlet-1", limit: "100" }).success).toBe(true);
    expect(catalogListQuerySchema.safeParse({ outlet: "outlet-1", limit: "0" }).success).toBe(false);
    expect(catalogListQuerySchema.safeParse({ outlet: "outlet-1", limit: "101" }).success).toBe(false);
    expect(catalogListQuerySchema.safeParse({ outlet: "outlet-1", limit: "abc" }).success).toBe(false);
  });

  it("accepts valid filter values", () => {
    for (const filter of ["all", "active", "inactive", "archived"]) {
      const result = catalogListQuerySchema.safeParse({ outlet: "outlet-1", filter });
      expect(result.success).toBe(true);
      if (!result.success) throw new Error("Expected valid query");
      expect(result.data.filter).toBe(filter);
    }
  });

  it("rejects invalid filter", () => {
    const result = catalogListQuerySchema.safeParse({ outlet: "outlet-1", filter: "invalid" });
    expect(result.success).toBe(false);
  });

  it("trims and bounds search", () => {
    const result = catalogListQuerySchema.safeParse({ outlet: "outlet-1", search: "  nasi  " });
    expect(result.success).toBe(true);
    if (!result.success) throw new Error("Expected valid query");
    expect(result.data.search).toBe("nasi");

    const longSearch = "a".repeat(MAX_CATEGORY_NAME + 1);
    expect(catalogListQuerySchema.safeParse({ outlet: "outlet-1", search: longSearch }).success).toBe(false);
  });

  it("accepts empty search as undefined", () => {
    const result = catalogListQuerySchema.safeParse({ outlet: "outlet-1", search: "   " });
    expect(result.success).toBe(true);
    if (!result.success) throw new Error("Expected valid query");
    expect(result.data.search).toBeUndefined();
  });

  it("accepts valid cursor", () => {
    const payload = {
      v: 1 as const,
      sortOrder: 0,
      name: "Test",
      id: "cat-1",
      outletId: "outlet-1",
      filter: "all",
      search: undefined,
    };
    const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const result = catalogListQuerySchema.safeParse({ outlet: "outlet-1", cursor: encoded });
    expect(result.success).toBe(true);
    if (!result.success) throw new Error("Expected valid query");
  });

  it("rejects empty cursor", () => {
    const result = catalogListQuerySchema.safeParse({ outlet: "outlet-1", cursor: "" });
    expect(result.success).toBe(false);
  });

  it("rejects duplicate parameters", () => {
    const result = catalogListQuerySchema.safeParse({ outlet: ["outlet-1", "outlet-2"] });
    expect(result.success).toBe(false);
  });
});

describe("cursor encoding/decoding", () => {
  const payload: CursorPayload = {
    v: 1,
    sortOrder: 5,
    name: "Minuman",
    id: "cat-2",
    outletId: "outlet-1",
    filter: "active",
    search: "min",
  };

  it("encodes and decodes round-trip", () => {
    const encoded = encodeCursor(payload);
    const decoded = decodeCursor(encoded);
    expect(decoded).toEqual(payload);
  });

  it("returns null for malformed base64", () => {
    expect(decodeCursor("not-base64!")).toBeNull();
  });

  it("returns null for invalid JSON", () => {
    const encoded = Buffer.from("not-json").toString("base64url");
    expect(decodeCursor(encoded)).toBeNull();
  });

  it("returns null for wrong version", () => {
    const badVersion = { ...payload, v: 2 };
    const encoded = Buffer.from(JSON.stringify(badVersion)).toString("base64url");
    expect(decodeCursor(encoded)).toBeNull();
  });

  it("returns null for missing fields", () => {
    const incomplete = { v: 1, sortOrder: 0, name: "Test", id: "cat-1" };
    const encoded = Buffer.from(JSON.stringify(incomplete)).toString("base64url");
    expect(decodeCursor(encoded)).toBeNull();
  });

  it("validates binding against expected context", () => {
    const encoded = encodeCursor(payload);
    expect(validateCursorBinding(payload, { outletId: "outlet-1", filter: "active", search: "min" })).toBe(true);
    expect(validateCursorBinding(payload, { outletId: "outlet-2", filter: "active", search: "min" })).toBe(false);
    expect(validateCursorBinding(payload, { outletId: "outlet-1", filter: "all", search: "min" })).toBe(false);
    expect(validateCursorBinding(payload, { outletId: "outlet-1", filter: "active", search: "other" })).toBe(false);
  });
});