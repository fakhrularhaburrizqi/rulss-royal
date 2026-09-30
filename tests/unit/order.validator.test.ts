import { describe, expect, it } from "vitest";

import { MAX_CUSTOMER_NAME, MAX_ITEM_LINES, MAX_NOTE } from "@/lib/order/constants";
import {
  domainCreateOrderSchema,
  normalizeOptionalText,
  staffCreateOrderSchema,
  updateOrderStatusSchema,
} from "@/lib/validators/order.validator";

const baseItem = { menuItemId: "menu-1", quantity: 1 };

const domainCashier = {
  source: "CASHIER",
  outletId: "outlet-1",
  items: [baseItem],
};

const staffBase = {
  outletId: "outlet-1",
  items: [baseItem],
};

const updateBase = {
  outletId: "outlet-1",
  orderId: "order-1",
  status: "RECEIVED",
  version: 1,
};

describe("normalizeOptionalText", () => {
  it("trims text and maps empty text to undefined", () => {
    expect(normalizeOptionalText("  halo  ")).toBe("halo");
    expect(normalizeOptionalText("")).toBeUndefined();
    expect(normalizeOptionalText("   ")).toBeUndefined();
  });
});

describe("domainCreateOrderSchema", () => {
  it("accepts a valid CASHIER order", () => {
    const result = domainCreateOrderSchema.safeParse(domainCashier);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.source).toBe("CASHIER");
      expect(result.data.outletId).toBe("outlet-1");
      expect(result.data.items).toHaveLength(1);
    }
  });

  it("accepts QR_TABLE without a table at the shape level", () => {
    const result = domainCreateOrderSchema.safeParse({
      ...domainCashier,
      source: "QR_TABLE",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.source).toBe("QR_TABLE");
      expect(result.data.diningTableId).toBeUndefined();
    }
  });

  it("rejects an unknown source", () => {
    expect(domainCreateOrderSchema.safeParse({ ...domainCashier, source: "GUEST" }).success).toBe(
      false
    );
    expect(domainCreateOrderSchema.safeParse({ ...domainCashier, source: 7 }).success).toBe(false);
    expect(domainCreateOrderSchema.safeParse({ ...domainCashier }).success).toBe(true);
  });

  it("rejects missing source", () => {
    const { source: _source, ...withoutSource } = domainCashier;
    expect(domainCreateOrderSchema.safeParse(withoutSource).success).toBe(false);
  });

  it("rejects sensitive and nominal fields", () => {
    for (const foreignField of [
      { price: 1_000 },
      { subtotal: 1_000 },
      { total: 1_000 },
      { taxAmount: 0 },
      { serviceAmount: 0 },
      { tenantId: "tenant-1" },
      { createdByUserId: "user-1" },
    ]) {
      expect(
        domainCreateOrderSchema.safeParse({ ...domainCashier, ...foreignField }).success,
        JSON.stringify(foreignField)
      ).toBe(false);
    }
  });
});

describe("staffCreateOrderSchema", () => {
  it("accepts valid staff input and normalizes output", () => {
    const result = staffCreateOrderSchema.safeParse({
      outletId: "  outlet-1 ",
      customerName: "  Budi  ",
      note: "  tanpa es  ",
      diningTableId: "  table-1 ",
      items: [{ menuItemId: " menu-1 ", quantity: 2, note: "  pedas  " }],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.outletId).toBe("outlet-1");
      expect(result.data.customerName).toBe("Budi");
      expect(result.data.note).toBe("tanpa es");
      expect(result.data.diningTableId).toBe("table-1");
      expect(result.data.items[0].menuItemId).toBe("menu-1");
      expect(result.data.items[0].note).toBe("pedas");
    }
  });

  it("rejects a payload that contains source", () => {
    expect(staffCreateOrderSchema.safeParse({ ...staffBase, source: "CASHIER" }).success).toBe(
      false
    );
    expect(staffCreateOrderSchema.safeParse({ ...staffBase, source: "QR_TABLE" }).success).toBe(
      false
    );
  });

  it("maps empty optional text to undefined", () => {
    const result = staffCreateOrderSchema.safeParse({
      ...staffBase,
      customerName: "",
      note: "   ",
      items: [{ menuItemId: "menu-1", quantity: 1, note: "" }],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.customerName).toBeUndefined();
      expect(result.data.note).toBeUndefined();
      expect(result.data.items[0].note).toBeUndefined();
    }
  });

  it("maps an empty diningTableId to null", () => {
    const result = staffCreateOrderSchema.safeParse({ ...staffBase, diningTableId: "  " });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.diningTableId).toBeNull();
    }
    const explicitNull = staffCreateOrderSchema.safeParse({ ...staffBase, diningTableId: null });
    expect(explicitNull.success).toBe(true);
  });

  it("trims IDs and rejects empty or non-string IDs", () => {
    const trimmed = staffCreateOrderSchema.safeParse({
      ...staffBase,
      outletId: " outlet-1 ",
      items: [{ menuItemId: " menu-1 ", quantity: 1 }],
    });
    expect(trimmed.success).toBe(true);
    if (trimmed.success) {
      expect(trimmed.data.outletId).toBe("outlet-1");
    }

    expect(staffCreateOrderSchema.safeParse({ ...staffBase, outletId: "" }).success).toBe(false);
    expect(staffCreateOrderSchema.safeParse({ ...staffBase, outletId: "   " }).success).toBe(false);
    expect(staffCreateOrderSchema.safeParse({ ...staffBase, outletId: 123 }).success).toBe(false);
    expect(staffCreateOrderSchema.safeParse({ ...staffBase, outletId: { id: "x" } }).success).toBe(
      false
    );
    expect(
      staffCreateOrderSchema.safeParse({
        ...staffBase,
        items: [{ menuItemId: "", quantity: 1 }],
      }).success
    ).toBe(false);
    expect(
      staffCreateOrderSchema.safeParse({
        ...staffBase,
        items: [{ menuItemId: 42, quantity: 1 }],
      }).success
    ).toBe(false);
  });

  it("rejects an empty or oversized item list", () => {
    expect(staffCreateOrderSchema.safeParse({ ...staffBase, items: [] }).success).toBe(false);

    const tooMany = Array.from({ length: MAX_ITEM_LINES + 1 }, (_, index) => ({
      menuItemId: `menu-${index}`,
      quantity: 1,
    }));
    expect(staffCreateOrderSchema.safeParse({ ...staffBase, items: tooMany }).success).toBe(false);

    const exactlyMax = Array.from({ length: MAX_ITEM_LINES }, (_, index) => ({
      menuItemId: `menu-${index}`,
      quantity: 1,
    }));
    expect(staffCreateOrderSchema.safeParse({ ...staffBase, items: exactlyMax }).success).toBe(
      true
    );
  });

  it("rejects quantities outside 1..MAX_QUANTITY_PER_LINE", () => {
    for (const quantity of [0, 100, -1, 1.5]) {
      const result = staffCreateOrderSchema.safeParse({
        ...staffBase,
        items: [{ menuItemId: "menu-1", quantity }],
      });
      expect(result.success, String(quantity)).toBe(false);
    }
    const maxQuantity = staffCreateOrderSchema.safeParse({
      ...staffBase,
      items: [{ menuItemId: "menu-1", quantity: 99 }],
    });
    expect(maxQuantity.success).toBe(true);
  });

  it("rejects duplicate menuItemId, including duplicates created by trimming", () => {
    const exactDuplicate = staffCreateOrderSchema.safeParse({
      ...staffBase,
      items: [
        { menuItemId: "menu-1", quantity: 1 },
        { menuItemId: "menu-1", quantity: 2 },
      ],
    });
    expect(exactDuplicate.success).toBe(false);

    const duplicateAfterTrim = staffCreateOrderSchema.safeParse({
      ...staffBase,
      items: [
        { menuItemId: "menu-1", quantity: 1 },
        { menuItemId: "  menu-1  ", quantity: 2 },
      ],
    });
    expect(duplicateAfterTrim.success).toBe(false);
  });

  it("rejects customerName above the maximum length", () => {
    const tooLong = "N".repeat(MAX_CUSTOMER_NAME + 1);
    expect(staffCreateOrderSchema.safeParse({ ...staffBase, customerName: tooLong }).success).toBe(
      false
    );
    const atLimit = staffCreateOrderSchema.safeParse({
      ...staffBase,
      customerName: "N".repeat(MAX_CUSTOMER_NAME),
    });
    expect(atLimit.success).toBe(true);
  });

  it("rejects order and item notes above the maximum length", () => {
    const longNote = "x".repeat(MAX_NOTE + 1);
    expect(staffCreateOrderSchema.safeParse({ ...staffBase, note: longNote }).success).toBe(false);
    expect(
      staffCreateOrderSchema.safeParse({
        ...staffBase,
        items: [{ menuItemId: "menu-1", quantity: 1, note: longNote }],
      }).success
    ).toBe(false);
    expect(
      staffCreateOrderSchema.safeParse({ ...staffBase, note: "x".repeat(MAX_NOTE) }).success
    ).toBe(true);
  });

  it("rejects nested unknown fields inside items", () => {
    const result = staffCreateOrderSchema.safeParse({
      ...staffBase,
      items: [{ menuItemId: "menu-1", quantity: 1, price: 1_000 }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects top-level sensitive, tenant, and actor fields", () => {
    for (const foreignField of [
      { price: 1_000 },
      { subtotal: 1_000 },
      { total: 1_000 },
      { taxAmount: 0 },
      { serviceAmount: 0 },
      { tenantId: "tenant-1" },
      { createdByUserId: "user-1" },
      { status: "RECEIVED" },
      { unknownField: true },
    ]) {
      expect(
        staffCreateOrderSchema.safeParse({ ...staffBase, ...foreignField }).success,
        JSON.stringify(foreignField)
      ).toBe(false);
    }
  });
});

describe("updateOrderStatusSchema", () => {
  it("accepts a valid status update", () => {
    const result = updateOrderStatusSchema.safeParse({
      ...updateBase,
      status: "PREPARING",
      version: 2,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe("PREPARING");
      expect(result.data.version).toBe(2);
      expect(result.data.orderId).toBe("order-1");
    }
  });

  it("rejects an unknown status value", () => {
    expect(updateOrderStatusSchema.safeParse({ ...updateBase, status: "DELIVERED" }).success).toBe(
      false
    );
    expect(updateOrderStatusSchema.safeParse({ ...updateBase, status: 5 }).success).toBe(false);
    expect(updateOrderStatusSchema.safeParse({ ...updateBase }).success).toBe(true);
  });

  it("rejects versions below one or non-integers", () => {
    for (const version of [0, -1, 1.5]) {
      expect(
        updateOrderStatusSchema.safeParse({ ...updateBase, version }).success,
        String(version)
      ).toBe(false);
    }
    expect(updateOrderStatusSchema.safeParse({ ...updateBase, version: "1" }).success).toBe(false);
  });

  it("rejects currentStatus and other unknown fields", () => {
    expect(
      updateOrderStatusSchema.safeParse({ ...updateBase, currentStatus: "RECEIVED" }).success
    ).toBe(false);
    expect(updateOrderStatusSchema.safeParse({ ...updateBase, tenantId: "tenant-1" }).success).toBe(
      false
    );
    expect(updateOrderStatusSchema.safeParse({ ...updateBase, userId: "user-1" }).success).toBe(
      false
    );
    expect(updateOrderStatusSchema.safeParse({ ...updateBase, note: "x" }).success).toBe(false);
  });

  it("trims IDs and rejects empty IDs", () => {
    const result = updateOrderStatusSchema.safeParse({
      ...updateBase,
      outletId: " outlet-1 ",
      orderId: "  order-1",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.outletId).toBe("outlet-1");
      expect(result.data.orderId).toBe("order-1");
    }
    expect(updateOrderStatusSchema.safeParse({ ...updateBase, orderId: "" }).success).toBe(false);
  });
});
