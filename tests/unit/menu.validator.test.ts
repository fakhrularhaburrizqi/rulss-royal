import { z } from "zod";
import { describe, expect, it } from "vitest";

import { MAX_MONEY, MAX_SORT_ORDER } from "@/lib/order/constants";
import {
  categoryArchiveSchema,
  categoryCreateSchema,
  categoryRestoreSchema,
  categoryUpdateSchema,
  menuItemArchiveSchema,
  menuItemCreateSchema,
  menuItemRestoreSchema,
  menuItemSoldOutSchema,
  menuItemUpdateSchema,
} from "@/lib/validators/menu.validator";

const NOW_ISO = new Date().toISOString();

function categoryCreatePayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { outletId: "outlet-1", name: "Makanan", ...overrides };
}

function categoryUpdatePayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    outletId: "outlet-1",
    categoryId: "cat-1",
    expectedUpdatedAt: NOW_ISO,
    ...overrides,
  };
}

function categoryTargetPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    outletId: "outlet-1",
    categoryId: "cat-1",
    expectedUpdatedAt: NOW_ISO,
    ...overrides,
  };
}

function menuItemCreatePayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    outletId: "outlet-1",
    categoryId: "cat-1",
    name: "Nasi Goreng",
    price: 25_000,
    ...overrides,
  };
}

function menuItemUpdatePayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    outletId: "outlet-1",
    menuItemId: "item-1",
    expectedUpdatedAt: NOW_ISO,
    ...overrides,
  };
}

function menuItemTargetPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    outletId: "outlet-1",
    menuItemId: "item-1",
    expectedUpdatedAt: NOW_ISO,
    ...overrides,
  };
}

function parseOrThrow<T extends z.ZodTypeAny>(schema: T, payload: unknown): z.infer<T> {
  const result = schema.safeParse(payload);
  if (!result.success) {
    throw new Error("expected payload to parse");
  }
  return result.data;
}

function expectRejected(schema: z.ZodTypeAny, payload: unknown): void {
  expect(schema.safeParse(payload).success).toBe(false);
}

describe("menu validator - shared primitives", () => {
  it("trims identifier fields", () => {
    expect(
      parseOrThrow(categoryCreateSchema, categoryCreatePayload({ outletId: "  outlet-1  " }))
        .outletId
    ).toBe("outlet-1");
    expect(
      parseOrThrow(
        categoryUpdateSchema,
        categoryUpdatePayload({ categoryId: "  cat-1  ", name: "Makanan" })
      ).categoryId
    ).toBe("cat-1");
    expect(
      parseOrThrow(
        menuItemUpdateSchema,
        menuItemUpdatePayload({ menuItemId: "  item-1  ", name: "Nasi Goreng" })
      ).menuItemId
    ).toBe("item-1");
  });

  it("rejects empty or whitespace-only identifiers", () => {
    expectRejected(categoryCreateSchema, categoryCreatePayload({ outletId: "" }));
    expectRejected(categoryCreateSchema, categoryCreatePayload({ outletId: "   " }));
    expectRejected(categoryUpdateSchema, categoryUpdatePayload({ categoryId: "" }));
    expectRejected(categoryUpdateSchema, categoryUpdatePayload({ outletId: "  " }));
    expectRejected(menuItemCreateSchema, menuItemCreatePayload({ outletId: "" }));
    expectRejected(menuItemUpdateSchema, menuItemUpdatePayload({ menuItemId: "" }));
    expectRejected(menuItemArchiveSchema, menuItemTargetPayload({ menuItemId: "   " }));
  });

  it("rejects non-string identifiers", () => {
    for (const badId of [42, null, { id: "outlet-1" }]) {
      expectRejected(categoryCreateSchema, categoryCreatePayload({ outletId: badId }));
      expectRejected(menuItemUpdateSchema, menuItemUpdatePayload({ menuItemId: badId }));
    }
  });

  it("rejects foreign fields on every schema", () => {
    const targets: Array<[z.ZodTypeAny, Record<string, unknown>]> = [
      [categoryCreateSchema, categoryCreatePayload()],
      [categoryUpdateSchema, categoryUpdatePayload()],
      [categoryArchiveSchema, categoryTargetPayload()],
      [categoryRestoreSchema, categoryTargetPayload()],
      [menuItemCreateSchema, menuItemCreatePayload()],
      [menuItemUpdateSchema, menuItemUpdatePayload()],
      [menuItemArchiveSchema, menuItemTargetPayload()],
      [menuItemRestoreSchema, menuItemTargetPayload()],
      [menuItemSoldOutSchema, menuItemTargetPayload({ isSoldOut: false })],
    ];
    const foreignKeys = ["tenantId", "userId", "permission", "deletedAt", "updatedAt"];

    for (const [schema, payload] of targets) {
      for (const foreignKey of foreignKeys) {
        expectRejected(schema, { ...payload, [foreignKey]: "x" });
      }
    }
  });

  it("keeps a toISOString expectedUpdatedAt value as a string", () => {
    const data = parseOrThrow(
      categoryUpdateSchema,
      categoryUpdatePayload({ name: "Makanan Baru" })
    );
    expect(typeof data.expectedUpdatedAt).toBe("string");
    expect(data.expectedUpdatedAt).toBe(NOW_ISO);
    expect(NOW_ISO).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it("rejects invalid ISO timestamps", () => {
    for (const badTimestamp of [
      "",
      "not-a-date",
      "2026-10-02",
      "2026-10-02T09:30:00",
      "2026-10-02T09:30:00+07:00",
      "2026-13-02T00:00:00Z",
      "2026-02-30T00:00:00Z",
      "2026-10-02T25:00:00Z",
      "2026-10-02T09:61:00Z",
    ]) {
      expectRejected(
        categoryUpdateSchema,
        categoryUpdatePayload({ expectedUpdatedAt: badTimestamp })
      );
      expectRejected(
        menuItemUpdateSchema,
        menuItemUpdatePayload({ expectedUpdatedAt: badTimestamp })
      );
    }
  });

  it("rejects non-string expectedUpdatedAt values", () => {
    for (const badTimestamp of [1_765_000_000_000, new Date(), null]) {
      expectRejected(
        categoryUpdateSchema,
        categoryUpdatePayload({ expectedUpdatedAt: badTimestamp })
      );
      expectRejected(
        menuItemSoldOutSchema,
        menuItemTargetPayload({ isSoldOut: true, expectedUpdatedAt: badTimestamp })
      );
    }
  });

  it("rejects row mutations without expectedUpdatedAt", () => {
    expectRejected(categoryUpdateSchema, {
      outletId: "outlet-1",
      categoryId: "cat-1",
      name: "Makanan",
    });
    expectRejected(categoryArchiveSchema, { outletId: "outlet-1", categoryId: "cat-1" });
    expectRejected(categoryRestoreSchema, { outletId: "outlet-1", categoryId: "cat-1" });
    expectRejected(menuItemUpdateSchema, {
      outletId: "outlet-1",
      menuItemId: "item-1",
      price: 1_000,
    });
    expectRejected(menuItemArchiveSchema, { outletId: "outlet-1", menuItemId: "item-1" });
    expectRejected(menuItemRestoreSchema, { outletId: "outlet-1", menuItemId: "item-1" });
    expectRejected(menuItemSoldOutSchema, {
      outletId: "outlet-1",
      menuItemId: "item-1",
      isSoldOut: true,
    });
  });
});

describe("categoryCreateSchema", () => {
  it("accepts a minimum valid payload", () => {
    const data = parseOrThrow(categoryCreateSchema, categoryCreatePayload());
    expect(data.outletId).toBe("outlet-1");
    expect(data.name).toBe("Makanan");
    expect(data.sortOrder).toBeUndefined();
    expect(data.isActive).toBeUndefined();
    expect("sortOrder" in data).toBe(false);
  });

  it("accepts every optional field", () => {
    const data = parseOrThrow(
      categoryCreateSchema,
      categoryCreatePayload({ sortOrder: 5, isActive: false })
    );
    expect(data.sortOrder).toBe(5);
    expect(data.isActive).toBe(false);
  });

  it("trims the category name", () => {
    expect(
      parseOrThrow(categoryCreateSchema, categoryCreatePayload({ name: "  Makanan  " })).name
    ).toBe("Makanan");
  });

  it("rejects an empty or whitespace-only name", () => {
    expectRejected(categoryCreateSchema, categoryCreatePayload({ name: "" }));
    expectRejected(categoryCreateSchema, categoryCreatePayload({ name: "   " }));
  });

  it("accepts an 80 character name and rejects 81 characters", () => {
    expect(
      parseOrThrow(categoryCreateSchema, categoryCreatePayload({ name: "K".repeat(80) })).name
    ).toHaveLength(80);
    expectRejected(categoryCreateSchema, categoryCreatePayload({ name: "K".repeat(81) }));
  });

  it("accepts sortOrder 0 and MAX_SORT_ORDER", () => {
    expect(
      parseOrThrow(categoryCreateSchema, categoryCreatePayload({ sortOrder: 0 })).sortOrder
    ).toBe(0);
    expect(
      parseOrThrow(categoryCreateSchema, categoryCreatePayload({ sortOrder: MAX_SORT_ORDER }))
        .sortOrder
    ).toBe(MAX_SORT_ORDER);
  });

  it("rejects invalid sortOrder values", () => {
    for (const badSortOrder of [-1, MAX_SORT_ORDER + 1, 1.5]) {
      expectRejected(categoryCreateSchema, categoryCreatePayload({ sortOrder: badSortOrder }));
    }
  });

  it("accepts isActive false and rejects string booleans", () => {
    expect(
      parseOrThrow(categoryCreateSchema, categoryCreatePayload({ isActive: false })).isActive
    ).toBe(false);
    for (const badBoolean of ["false", "true", 0, 1]) {
      expectRejected(categoryCreateSchema, categoryCreatePayload({ isActive: badBoolean }));
    }
  });

  it("rejects unknown fields such as source", () => {
    expectRejected(categoryCreateSchema, categoryCreatePayload({ source: "CASHIER" }));
  });
});

describe("categoryUpdateSchema", () => {
  it("accepts a payload that only changes name", () => {
    const data = parseOrThrow(categoryUpdateSchema, categoryUpdatePayload({ name: "  Minuman  " }));
    expect(data.name).toBe("Minuman");
    expect(data.sortOrder).toBeUndefined();
    expect(data.isActive).toBeUndefined();
  });

  it("accepts a payload that only changes sortOrder to 0", () => {
    const data = parseOrThrow(categoryUpdateSchema, categoryUpdatePayload({ sortOrder: 0 }));
    expect(data.sortOrder).toBe(0);
  });

  it("accepts a payload that only changes isActive to false", () => {
    const data = parseOrThrow(categoryUpdateSchema, categoryUpdatePayload({ isActive: false }));
    expect(data.isActive).toBe(false);
  });

  it("rejects a payload without any mutable field", () => {
    expectRejected(categoryUpdateSchema, categoryUpdatePayload());
  });

  it("does not count outletId, categoryId or expectedUpdatedAt as mutable", () => {
    expectRejected(categoryUpdateSchema, {
      outletId: "outlet-1",
      categoryId: "cat-1",
      expectedUpdatedAt: NOW_ISO,
    });
  });
});

describe("categoryArchiveSchema and categoryRestoreSchema", () => {
  it("accepts a valid target payload for both schemas", () => {
    const archive = parseOrThrow(categoryArchiveSchema, categoryTargetPayload());
    const restore = parseOrThrow(categoryRestoreSchema, categoryTargetPayload());
    expect(archive).toEqual(categoryTargetPayload());
    expect(restore).toEqual(categoryTargetPayload());
  });

  it("rejects unknown fields such as price on both schemas", () => {
    expectRejected(categoryArchiveSchema, categoryTargetPayload({ price: 1_000 }));
    expectRejected(categoryRestoreSchema, categoryTargetPayload({ price: 1_000 }));
    expectRejected(categoryArchiveSchema, categoryTargetPayload({ name: "Makanan" }));
  });
});

describe("menuItemCreateSchema", () => {
  it("accepts a minimum valid payload", () => {
    const data = parseOrThrow(menuItemCreateSchema, menuItemCreatePayload());
    expect(data.outletId).toBe("outlet-1");
    expect(data.categoryId).toBe("cat-1");
    expect(data.name).toBe("Nasi Goreng");
    expect(data.price).toBe(25_000);
    expect("description" in data).toBe(false);
    expect("imageUrl" in data).toBe(false);
    expect("imageAlt" in data).toBe(false);
    expect("isActive" in data).toBe(false);
    expect("isSoldOut" in data).toBe(false);
  });

  it("accepts every optional field", () => {
    const data = parseOrThrow(
      menuItemCreateSchema,
      menuItemCreatePayload({
        description: "  Pedas manis  ",
        imageUrl: "  https://cdn.example.com/nasi.png  ",
        imageAlt: "  Piring nasi goreng  ",
        sortOrder: 3,
        isActive: false,
        isSoldOut: false,
      })
    );
    expect(data.description).toBe("Pedas manis");
    expect(data.imageUrl).toBe("https://cdn.example.com/nasi.png");
    expect(data.imageAlt).toBe("Piring nasi goreng");
    expect(data.sortOrder).toBe(3);
    expect(data.isActive).toBe(false);
    expect(data.isSoldOut).toBe(false);
  });

  it("trims the menu name and rejects empty or overlong names", () => {
    expect(
      parseOrThrow(menuItemCreateSchema, menuItemCreatePayload({ name: "  Es Teh  " })).name
    ).toBe("Es Teh");
    expectRejected(menuItemCreateSchema, menuItemCreatePayload({ name: "" }));
    expectRejected(menuItemCreateSchema, menuItemCreatePayload({ name: "   " }));
    expect(
      parseOrThrow(menuItemCreateSchema, menuItemCreatePayload({ name: "M".repeat(120) })).name
    ).toHaveLength(120);
    expectRejected(menuItemCreateSchema, menuItemCreatePayload({ name: "M".repeat(121) }));
  });

  it("accepts price boundaries 0 and MAX_MONEY", () => {
    expect(parseOrThrow(menuItemCreateSchema, menuItemCreatePayload({ price: 0 })).price).toBe(0);
    expect(
      parseOrThrow(menuItemCreateSchema, menuItemCreatePayload({ price: MAX_MONEY })).price
    ).toBe(MAX_MONEY);
  });

  it("rejects invalid price values", () => {
    for (const badPrice of [
      -1,
      MAX_MONEY + 1,
      1_000.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
    ]) {
      expectRejected(menuItemCreateSchema, menuItemCreatePayload({ price: badPrice }));
    }
  });

  it("normalizes description between missing, empty and text", () => {
    const missing = parseOrThrow(menuItemCreateSchema, menuItemCreatePayload());
    expect(missing.description).toBeUndefined();
    expect("description" in missing).toBe(false);

    const emptied = parseOrThrow(
      menuItemCreateSchema,
      menuItemCreatePayload({ description: "   " })
    );
    expect(emptied.description).toBeNull();

    const text = parseOrThrow(
      menuItemCreateSchema,
      menuItemCreatePayload({ description: "  Hangat  " })
    );
    expect(text.description).toBe("Hangat");
  });

  it("enforces the description length boundary of 500", () => {
    expect(
      parseOrThrow(menuItemCreateSchema, menuItemCreatePayload({ description: "d".repeat(500) }))
        .description
    ).toHaveLength(500);
    expectRejected(menuItemCreateSchema, menuItemCreatePayload({ description: "d".repeat(501) }));
  });

  it("normalizes imageAlt between missing, empty and text", () => {
    const missing = parseOrThrow(menuItemCreateSchema, menuItemCreatePayload());
    expect(missing.imageAlt).toBeUndefined();
    expect("imageAlt" in missing).toBe(false);

    const emptied = parseOrThrow(menuItemCreateSchema, menuItemCreatePayload({ imageAlt: "  " }));
    expect(emptied.imageAlt).toBeNull();

    expect(
      parseOrThrow(menuItemCreateSchema, menuItemCreatePayload({ imageAlt: "a".repeat(120) }))
        .imageAlt
    ).toHaveLength(120);
    expectRejected(menuItemCreateSchema, menuItemCreatePayload({ imageAlt: "a".repeat(121) }));
    expectRejected(menuItemCreateSchema, menuItemCreatePayload({ imageAlt: 42 }));
  });

  it("accepts http and https imageUrl values and trims them", () => {
    expect(
      parseOrThrow(
        menuItemCreateSchema,
        menuItemCreatePayload({ imageUrl: "  https://cdn.example.com/a.png  " })
      ).imageUrl
    ).toBe("https://cdn.example.com/a.png");
    expect(
      parseOrThrow(
        menuItemCreateSchema,
        menuItemCreatePayload({ imageUrl: "http://cdn.example.com/a.png" })
      ).imageUrl
    ).toBe("http://cdn.example.com/a.png");
  });

  it("normalizes imageUrl between missing and empty", () => {
    const missing = parseOrThrow(menuItemCreateSchema, menuItemCreatePayload());
    expect(missing.imageUrl).toBeUndefined();
    expect("imageUrl" in missing).toBe(false);

    expect(
      parseOrThrow(menuItemCreateSchema, menuItemCreatePayload({ imageUrl: "" })).imageUrl
    ).toBeNull();
    expect(
      parseOrThrow(menuItemCreateSchema, menuItemCreatePayload({ imageUrl: "   " })).imageUrl
    ).toBeNull();
  });

  it("rejects unsafe, relative or invalid imageUrl values", () => {
    for (const badUrl of [
      "ftp://cdn.example.com/a.png",
      "file:///etc/passwd",
      "javascript:alert(1)",
      "/images/a.png",
      "images/a.png",
      "example.com/a.png",
      "not a url",
    ]) {
      expectRejected(menuItemCreateSchema, menuItemCreatePayload({ imageUrl: badUrl }));
    }
    expectRejected(menuItemCreateSchema, menuItemCreatePayload({ imageUrl: 42 }));
  });

  it("enforces the imageUrl length boundary of 2048", () => {
    const urlAtLimit = `https://example.com/${"a".repeat(2048 - 20)}`;
    expect(urlAtLimit).toHaveLength(2048);
    expect(
      parseOrThrow(menuItemCreateSchema, menuItemCreatePayload({ imageUrl: urlAtLimit })).imageUrl
    ).toBe(urlAtLimit);

    const urlOverLimit = `https://example.com/${"a".repeat(2049 - 20)}`;
    expect(urlOverLimit).toHaveLength(2049);
    expectRejected(menuItemCreateSchema, menuItemCreatePayload({ imageUrl: urlOverLimit }));
  });

  it("accepts false booleans and rejects string booleans", () => {
    const data = parseOrThrow(
      menuItemCreateSchema,
      menuItemCreatePayload({ isActive: false, isSoldOut: false })
    );
    expect(data.isActive).toBe(false);
    expect(data.isSoldOut).toBe(false);

    for (const badBoolean of ["false", "true"]) {
      expectRejected(menuItemCreateSchema, menuItemCreatePayload({ isActive: badBoolean }));
      expectRejected(menuItemCreateSchema, menuItemCreatePayload({ isSoldOut: badBoolean }));
    }
  });

  it("rejects unknown fields such as source", () => {
    expectRejected(menuItemCreateSchema, menuItemCreatePayload({ source: "CASHIER" }));
  });
});

describe("menuItemUpdateSchema", () => {
  it("accepts a payload that only changes categoryId", () => {
    const data = parseOrThrow(menuItemUpdateSchema, menuItemUpdatePayload({ categoryId: "cat-2" }));
    expect(data.categoryId).toBe("cat-2");
    expect(data.name).toBeUndefined();
    expect(data.price).toBeUndefined();
  });

  it("accepts a payload that only changes name", () => {
    const data = parseOrThrow(
      menuItemUpdateSchema,
      menuItemUpdatePayload({ name: "  Nasi Uduk  " })
    );
    expect(data.name).toBe("Nasi Uduk");
  });

  it("accepts a payload that only changes price to 0", () => {
    const data = parseOrThrow(menuItemUpdateSchema, menuItemUpdatePayload({ price: 0 }));
    expect(data.price).toBe(0);
  });

  it("accepts a payload whose only change normalizes description to null", () => {
    const data = parseOrThrow(menuItemUpdateSchema, menuItemUpdatePayload({ description: "" }));
    expect(data.description).toBeNull();
  });

  it("accepts a payload whose only change normalizes imageAlt to null", () => {
    const data = parseOrThrow(menuItemUpdateSchema, menuItemUpdatePayload({ imageAlt: "  " }));
    expect(data.imageAlt).toBeNull();
  });

  it("accepts a payload whose only change normalizes imageUrl to null", () => {
    const data = parseOrThrow(menuItemUpdateSchema, menuItemUpdatePayload({ imageUrl: "" }));
    expect(data.imageUrl).toBeNull();
  });

  it("accepts a payload that only changes sortOrder to 0", () => {
    const data = parseOrThrow(menuItemUpdateSchema, menuItemUpdatePayload({ sortOrder: 0 }));
    expect(data.sortOrder).toBe(0);
  });

  it("accepts a payload that only changes isActive to false", () => {
    const data = parseOrThrow(menuItemUpdateSchema, menuItemUpdatePayload({ isActive: false }));
    expect(data.isActive).toBe(false);
  });

  it("accepts a payload that only changes isSoldOut to false", () => {
    const data = parseOrThrow(menuItemUpdateSchema, menuItemUpdatePayload({ isSoldOut: false }));
    expect(data.isSoldOut).toBe(false);
  });

  it("rejects a payload without any mutable field", () => {
    expectRejected(menuItemUpdateSchema, menuItemUpdatePayload());
  });

  it("does not count outletId, menuItemId or expectedUpdatedAt as mutable", () => {
    expectRejected(menuItemUpdateSchema, {
      outletId: "outlet-1",
      menuItemId: "item-1",
      expectedUpdatedAt: NOW_ISO,
    });
  });

  it("rejects invalid price values on update", () => {
    for (const badPrice of [-1, MAX_MONEY + 1, 19.99]) {
      expectRejected(menuItemUpdateSchema, menuItemUpdatePayload({ price: badPrice }));
    }
  });
});

describe("menuItemArchiveSchema and menuItemRestoreSchema", () => {
  it("accepts a valid target payload for both schemas", () => {
    const archive = parseOrThrow(menuItemArchiveSchema, menuItemTargetPayload());
    const restore = parseOrThrow(menuItemRestoreSchema, menuItemTargetPayload());
    expect(archive).toEqual(menuItemTargetPayload());
    expect(restore).toEqual(menuItemTargetPayload());
  });

  it("rejects unknown fields such as price on both schemas", () => {
    expectRejected(menuItemArchiveSchema, menuItemTargetPayload({ price: 5_000 }));
    expectRejected(menuItemRestoreSchema, menuItemTargetPayload({ price: 5_000 }));
    expectRejected(menuItemArchiveSchema, menuItemTargetPayload({ isSoldOut: true }));
  });
});

describe("menuItemSoldOutSchema", () => {
  it("accepts isSoldOut true and false with a valid timestamp", () => {
    expect(
      parseOrThrow(menuItemSoldOutSchema, menuItemTargetPayload({ isSoldOut: true })).isSoldOut
    ).toBe(true);
    expect(
      parseOrThrow(menuItemSoldOutSchema, menuItemTargetPayload({ isSoldOut: false })).isSoldOut
    ).toBe(false);
  });

  it("requires isSoldOut", () => {
    expectRejected(menuItemSoldOutSchema, {
      outletId: "outlet-1",
      menuItemId: "item-1",
      expectedUpdatedAt: NOW_ISO,
    });
  });

  it("rejects non-boolean isSoldOut values", () => {
    for (const badValue of ["true", "false", 1, 0]) {
      expectRejected(menuItemSoldOutSchema, menuItemTargetPayload({ isSoldOut: badValue }));
    }
  });

  it("rejects unknown fields", () => {
    expectRejected(
      menuItemSoldOutSchema,
      menuItemTargetPayload({ isSoldOut: true, isActive: false })
    );
  });
});
