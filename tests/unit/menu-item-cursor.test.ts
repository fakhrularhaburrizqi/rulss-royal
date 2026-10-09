import { describe, expect, it } from "vitest";

import {
  MENU_ITEM_CURSOR_VERSION,
  decodeMenuItemCursor,
  encodeMenuItemCursor,
  validateMenuItemCursorBinding,
  type MenuItemCursorPayload,
} from "@/lib/menu-item-cursor";

const payload: MenuItemCursorPayload = {
  v: MENU_ITEM_CURSOR_VERSION,
  categoryId: "cat-1",
  sortOrder: 3,
  name: "Nasi Goreng",
  id: "item-7",
  outletId: "outlet-1",
  filter: "active",
  search: "nasi",
};

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

describe("encode/decode round-trip", () => {
  it("preserves the full ordering tuple and binding fields", () => {
    const decoded = decodeMenuItemCursor(encodeMenuItemCursor(payload));
    expect(decoded).toEqual(payload);
    expect(decoded?.categoryId).toBe("cat-1");
    expect(decoded?.sortOrder).toBe(3);
    expect(decoded?.name).toBe("Nasi Goreng");
    expect(decoded?.id).toBe("item-7");
    expect(decoded?.outletId).toBe("outlet-1");
    expect(decoded?.filter).toBe("active");
    expect(decoded?.search).toBe("nasi");
  });

  it("round-trips an undefined search", () => {
    const withoutSearch: MenuItemCursorPayload = { ...payload, search: undefined };
    const decoded = decodeMenuItemCursor(encodeMenuItemCursor(withoutSearch));
    expect(decoded).toEqual(withoutSearch);
    expect(decoded?.search).toBeUndefined();
  });

  it("round-trips every filter value", () => {
    for (const filter of ["all", "active", "inactive", "archived"] as const) {
      const decoded = decodeMenuItemCursor(encodeMenuItemCursor({ ...payload, filter }));
      expect(decoded?.filter).toBe(filter);
    }
  });
});

describe("decodeMenuItemCursor - malformed input", () => {
  it("returns null for malformed base64", () => {
    expect(decodeMenuItemCursor("not-base64!")).toBeNull();
  });

  it("returns null for invalid JSON", () => {
    expect(decodeMenuItemCursor(Buffer.from("not-json").toString("base64url"))).toBeNull();
  });

  it("returns null for wrong version", () => {
    expect(decodeMenuItemCursor(encode({ ...payload, v: 2 }))).toBeNull();
  });

  it("returns null when categoryId is missing", () => {
    const { categoryId: _omitted, ...rest } = payload;
    expect(decodeMenuItemCursor(encode(rest))).toBeNull();
  });

  it("returns null when id is missing", () => {
    const { id: _omitted, ...rest } = payload;
    expect(decodeMenuItemCursor(encode(rest))).toBeNull();
  });

  it("returns null when sortOrder is not an integer", () => {
    expect(decodeMenuItemCursor(encode({ ...payload, sortOrder: "3" }))).toBeNull();
    expect(decodeMenuItemCursor(encode({ ...payload, sortOrder: 3.5 }))).toBeNull();
  });

  it("returns null when name is not a string", () => {
    expect(decodeMenuItemCursor(encode({ ...payload, name: 42 }))).toBeNull();
  });

  it("returns null when outletId is empty", () => {
    expect(decodeMenuItemCursor(encode({ ...payload, outletId: "" }))).toBeNull();
  });

  it("returns null for unknown filter values", () => {
    expect(decodeMenuItemCursor(encode({ ...payload, filter: "sold-out" }))).toBeNull();
  });

  it("returns null when search has the wrong type", () => {
    expect(decodeMenuItemCursor(encode({ ...payload, search: 7 }))).toBeNull();
  });

  it("returns null for non-object payloads", () => {
    expect(decodeMenuItemCursor(encode("payload"))).toBeNull();
    expect(decodeMenuItemCursor(encode(null))).toBeNull();
  });
});

describe("validateMenuItemCursorBinding", () => {
  it("accepts a fully matching binding", () => {
    expect(
      validateMenuItemCursorBinding(payload, {
        outletId: "outlet-1",
        filter: "active",
        search: "nasi",
      })
    ).toBe(true);
  });

  it("rejects outlet mismatch", () => {
    expect(
      validateMenuItemCursorBinding(payload, {
        outletId: "outlet-2",
        filter: "active",
        search: "nasi",
      })
    ).toBe(false);
  });

  it("rejects filter mismatch", () => {
    expect(
      validateMenuItemCursorBinding(payload, {
        outletId: "outlet-1",
        filter: "all",
        search: "nasi",
      })
    ).toBe(false);
  });

  it("rejects search mismatch", () => {
    expect(
      validateMenuItemCursorBinding(payload, {
        outletId: "outlet-1",
        filter: "active",
        search: "ayam",
      })
    ).toBe(false);
  });

  it("rejects undefined search against a defined search", () => {
    expect(
      validateMenuItemCursorBinding(payload, {
        outletId: "outlet-1",
        filter: "active",
        search: undefined,
      })
    ).toBe(false);
  });

  it("rejects defined search against an undefined search", () => {
    const withoutSearch: MenuItemCursorPayload = { ...payload, search: undefined };
    expect(
      validateMenuItemCursorBinding(withoutSearch, {
        outletId: "outlet-1",
        filter: "active",
        search: "nasi",
      })
    ).toBe(false);
  });
});
