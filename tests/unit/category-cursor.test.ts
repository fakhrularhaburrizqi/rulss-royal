import { describe, it, expect } from "vitest";
import { encodeCursor, decodeCursor, validateCursorBinding, type CursorPayload } from "@/lib/validators/category-query";

describe("category-cursor", () => {
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