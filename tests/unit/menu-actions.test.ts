import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as menuActions from "@/app/dashboard/menu-actions";
import {
  archiveCategoryAction,
  archiveMenuItemAction,
  createCategoryAction,
  createMenuItemAction,
  restoreCategoryAction,
  restoreMenuItemAction,
  setMenuItemSoldOutAction,
  updateCategoryAction,
  updateMenuItemAction,
} from "@/app/dashboard/menu-actions";
import { OrderDomainError, getOrderErrorMessage } from "@/lib/order/errors";
import {
  archiveMenuCategory,
  createMenuCategory,
  restoreMenuCategory,
  updateMenuCategory,
  type CategorySummary,
} from "@/lib/services/menu-category.service";
import {
  archiveMenuItem,
  createMenuItem,
  restoreMenuItem,
  setMenuItemSoldOut,
  updateMenuItem,
  type MenuItemSummary,
} from "@/lib/services/menu-item.service";

vi.mock("@/lib/services/menu-category.service", () => ({
  createMenuCategory: vi.fn(),
  updateMenuCategory: vi.fn(),
  archiveMenuCategory: vi.fn(),
  restoreMenuCategory: vi.fn(),
}));

vi.mock("@/lib/services/menu-item.service", () => ({
  createMenuItem: vi.fn(),
  updateMenuItem: vi.fn(),
  archiveMenuItem: vi.fn(),
  restoreMenuItem: vi.fn(),
  setMenuItemSoldOut: vi.fn(),
}));

const mockedCreateMenuCategory = vi.mocked(createMenuCategory);
const mockedUpdateMenuCategory = vi.mocked(updateMenuCategory);
const mockedArchiveMenuCategory = vi.mocked(archiveMenuCategory);
const mockedRestoreMenuCategory = vi.mocked(restoreMenuCategory);
const mockedCreateMenuItem = vi.mocked(createMenuItem);
const mockedUpdateMenuItem = vi.mocked(updateMenuItem);
const mockedArchiveMenuItem = vi.mocked(archiveMenuItem);
const mockedRestoreMenuItem = vi.mocked(restoreMenuItem);
const mockedSetMenuItemSoldOut = vi.mocked(setMenuItemSoldOut);

const UPDATED_AT = "2026-03-10T08:00:00.000Z";
const ARCHIVED_AT = "2026-03-11T09:30:00.000Z";
const RESTORED_AT = "2026-03-12T10:15:00.000Z";

function summaryFixture(overrides: Partial<CategorySummary> = {}): CategorySummary {
  return {
    id: "category-1",
    name: "Kopi",
    sortOrder: 0,
    isActive: true,
    deletedAt: null,
    updatedAt: UPDATED_AT,
    ...overrides,
  };
}

function itemSummaryFixture(overrides: Partial<MenuItemSummary> = {}): MenuItemSummary {
  return {
    id: "menu-1",
    categoryId: "category-1",
    name: "Es Kopi",
    price: 15_000,
    isActive: true,
    isSoldOut: false,
    deletedAt: null,
    updatedAt: UPDATED_AT,
    ...overrides,
  };
}

function createPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    outletId: "outlet-1",
    name: "Kopi",
    ...overrides,
  };
}

function updatePayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    outletId: "outlet-1",
    categoryId: "category-1",
    expectedUpdatedAt: UPDATED_AT,
    name: "Kopi Susu",
    ...overrides,
  };
}

function targetPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    outletId: "outlet-1",
    categoryId: "category-1",
    expectedUpdatedAt: UPDATED_AT,
    ...overrides,
  };
}

function itemCreatePayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    outletId: "outlet-1",
    categoryId: "category-1",
    name: "Es Kopi",
    price: 15_000,
    ...overrides,
  };
}

function itemUpdatePayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    outletId: "outlet-1",
    menuItemId: "menu-1",
    expectedUpdatedAt: UPDATED_AT,
    name: "Es Kopi Susu",
    ...overrides,
  };
}

function itemTargetPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    outletId: "outlet-1",
    menuItemId: "menu-1",
    expectedUpdatedAt: UPDATED_AT,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();

  mockedCreateMenuCategory.mockResolvedValue(summaryFixture());
  mockedUpdateMenuCategory.mockResolvedValue(
    summaryFixture({ name: "Kopi Susu", sortOrder: 2, isActive: false })
  );
  mockedArchiveMenuCategory.mockResolvedValue(
    summaryFixture({ isActive: false, deletedAt: ARCHIVED_AT, updatedAt: ARCHIVED_AT })
  );
  mockedRestoreMenuCategory.mockResolvedValue(summaryFixture({ updatedAt: RESTORED_AT }));

  mockedCreateMenuItem.mockResolvedValue(itemSummaryFixture());
  mockedUpdateMenuItem.mockResolvedValue(
    itemSummaryFixture({ name: "Es Kopi Susu", price: 17_000 })
  );
  mockedArchiveMenuItem.mockResolvedValue(
    itemSummaryFixture({ isActive: false, deletedAt: ARCHIVED_AT, updatedAt: ARCHIVED_AT })
  );
  mockedRestoreMenuItem.mockResolvedValue(itemSummaryFixture({ updatedAt: RESTORED_AT }));
  mockedSetMenuItemSoldOut.mockResolvedValue(
    itemSummaryFixture({ isSoldOut: true, updatedAt: RESTORED_AT })
  );
});

describe("menu actions (shared)", () => {
  it("is importable as a server action module", async () => {
    const modulePath = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../app/dashboard/menu-actions.ts"
    );
    const source = readFileSync(modulePath, "utf8");

    expect(source.split(/\r?\n/, 1)[0].replace(/;$/, "")).toBe('"use server"');

    expect(typeof createCategoryAction).toBe("function");
    expect(typeof updateCategoryAction).toBe("function");
    expect(typeof archiveCategoryAction).toBe("function");
    expect(typeof restoreCategoryAction).toBe("function");
    expect(typeof createMenuItemAction).toBe("function");
    expect(typeof updateMenuItemAction).toBe("function");
    expect(typeof archiveMenuItemAction).toBe("function");
    expect(typeof restoreMenuItemAction).toBe("function");
    expect(typeof setMenuItemSoldOutAction).toBe("function");

    expect(createCategoryAction.constructor.name).toBe("AsyncFunction");
    expect(updateCategoryAction.constructor.name).toBe("AsyncFunction");
    expect(archiveCategoryAction.constructor.name).toBe("AsyncFunction");
    expect(restoreCategoryAction.constructor.name).toBe("AsyncFunction");
    expect(createMenuItemAction.constructor.name).toBe("AsyncFunction");
    expect(updateMenuItemAction.constructor.name).toBe("AsyncFunction");
    expect(archiveMenuItemAction.constructor.name).toBe("AsyncFunction");
    expect(restoreMenuItemAction.constructor.name).toBe("AsyncFunction");
    expect(setMenuItemSoldOutAction.constructor.name).toBe("AsyncFunction");

    expect(Object.keys(menuActions).sort()).toEqual([
      "archiveCategoryAction",
      "archiveMenuItemAction",
      "createCategoryAction",
      "createMenuItemAction",
      "restoreCategoryAction",
      "restoreMenuItemAction",
      "setMenuItemSoldOutAction",
      "updateCategoryAction",
      "updateMenuItemAction",
    ]);
  });

  it("serializes every success, failure and invalid result with JSON.stringify", async () => {
    const createOk = await createCategoryAction(createPayload());
    const updateOk = await updateCategoryAction(updatePayload());
    const archiveOk = await archiveCategoryAction(targetPayload());
    const restoreOk = await restoreCategoryAction(targetPayload());
    const itemCreateOk = await createMenuItemAction(itemCreatePayload());
    const itemUpdateOk = await updateMenuItemAction(itemUpdatePayload());
    const itemArchiveOk = await archiveMenuItemAction(itemTargetPayload());
    const itemRestoreOk = await restoreMenuItemAction(itemTargetPayload());
    const itemSoldOutOk = await setMenuItemSoldOutAction(itemTargetPayload({ isSoldOut: true }));

    mockedCreateMenuCategory.mockRejectedValue(new OrderDomainError("CATEGORY_NAME_CONFLICT"));
    mockedRestoreMenuCategory.mockRejectedValue(new Error("boom"));
    mockedCreateMenuItem.mockRejectedValue(new OrderDomainError("MENU_NAME_CONFLICT"));
    mockedSetMenuItemSoldOut.mockRejectedValue(new Error("boom"));

    const createFail = await createCategoryAction(createPayload());
    const restoreFail = await restoreCategoryAction(targetPayload());
    const itemCreateFail = await createMenuItemAction(itemCreatePayload());
    const itemSoldOutFail = await setMenuItemSoldOutAction(itemTargetPayload({ isSoldOut: true }));

    const invalidResults = await Promise.all([
      createCategoryAction({}),
      updateCategoryAction({}),
      archiveCategoryAction({}),
      restoreCategoryAction({}),
      createMenuItemAction({}),
      updateMenuItemAction({}),
      archiveMenuItemAction({}),
      restoreMenuItemAction({}),
      setMenuItemSoldOutAction({}),
    ]);

    for (const result of [
      ...invalidResults,
      createOk,
      updateOk,
      archiveOk,
      restoreOk,
      itemCreateOk,
      itemUpdateOk,
      itemArchiveOk,
      itemRestoreOk,
      itemSoldOutOk,
      createFail,
      restoreFail,
      itemCreateFail,
      itemSoldOutFail,
    ]) {
      expect(() => JSON.stringify(result)).not.toThrow();
      expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    }
  });

  it("maps an unknown error with sensitive details to INTERNAL_ERROR without leaking", async () => {
    mockedCreateMenuCategory.mockRejectedValue(
      new Error("connect ECONNREFUSED 127.0.0.1:5432 password=hunter2")
    );
    mockedUpdateMenuItem.mockRejectedValue(
      new Error("connect ECONNREFUSED 127.0.0.1:5432 password=hunter2")
    );

    const categoryResult = await createCategoryAction(createPayload());
    const itemResult = await updateMenuItemAction(itemUpdatePayload());

    for (const result of [categoryResult, itemResult]) {
      expect(result).toEqual({
        ok: false,
        code: "INTERNAL_ERROR",
        message: getOrderErrorMessage("INTERNAL_ERROR"),
      });
      expect(JSON.stringify(result)).not.toContain("ECONNREFUSED");
      expect(JSON.stringify(result)).not.toContain("hunter2");
      expect(JSON.stringify(result)).not.toContain("5432");
    }
  });

  it("keeps the code and message of an OrderDomainError from the service", async () => {
    mockedUpdateMenuCategory.mockRejectedValue(new OrderDomainError("CATALOG_VERSION_CONFLICT"));

    const result = await updateCategoryAction(updatePayload());

    expect(result).toEqual({
      ok: false,
      code: "CATALOG_VERSION_CONFLICT",
      message: getOrderErrorMessage("CATALOG_VERSION_CONFLICT"),
    });
  });

  it("never calls a service when validation fails", async () => {
    const results = await Promise.all([
      createCategoryAction({}),
      updateCategoryAction({}),
      archiveCategoryAction({}),
      restoreCategoryAction({}),
      createMenuItemAction({}),
      updateMenuItemAction({}),
      archiveMenuItemAction({}),
      restoreMenuItemAction({}),
      setMenuItemSoldOutAction({}),
    ]);

    for (const result of results) {
      expect(result).toEqual({
        ok: false,
        code: "INVALID_INPUT",
        message: getOrderErrorMessage("INVALID_INPUT"),
      });
    }

    expect(mockedCreateMenuCategory).not.toHaveBeenCalled();
    expect(mockedUpdateMenuCategory).not.toHaveBeenCalled();
    expect(mockedArchiveMenuCategory).not.toHaveBeenCalled();
    expect(mockedRestoreMenuCategory).not.toHaveBeenCalled();
    expect(mockedCreateMenuItem).not.toHaveBeenCalled();
    expect(mockedUpdateMenuItem).not.toHaveBeenCalled();
    expect(mockedArchiveMenuItem).not.toHaveBeenCalled();
    expect(mockedRestoreMenuItem).not.toHaveBeenCalled();
    expect(mockedSetMenuItemSoldOut).not.toHaveBeenCalled();
  });
});

describe("createCategoryAction", () => {
  it("calls createMenuCategory exactly once for a minimum valid payload", async () => {
    const result = await createCategoryAction({ outletId: "outlet-1", name: "Kopi" });

    expect(result.ok).toBe(true);
    expect(mockedCreateMenuCategory).toHaveBeenCalledTimes(1);
  });

  it("forwards the normalized payload to the service", async () => {
    const result = await createCategoryAction({
      outletId: "  outlet-1  ",
      name: "  Kopi Pagi  ",
      sortOrder: 3,
      isActive: false,
    });

    expect(result.ok).toBe(true);
    expect(mockedCreateMenuCategory).toHaveBeenCalledWith({
      outletId: "outlet-1",
      name: "Kopi Pagi",
      sortOrder: 3,
      isActive: false,
    });
  });

  it("passes the CategorySummary through without turning timestamps into Date objects", async () => {
    const fixture = summaryFixture();
    mockedCreateMenuCategory.mockResolvedValue(fixture);

    const result = await createCategoryAction(createPayload());

    expect(result).toEqual({ ok: true, data: fixture });
    expect(result.ok).toBe(true);

    const data = result.ok ? result.data : null;
    expect(data).not.toBeNull();
    expect(typeof data?.updatedAt).toBe("string");
    expect(data?.updatedAt).not.toBeInstanceOf(Date);
    expect(data?.deletedAt).toBeNull();
    expect(data?.updatedAt).toBe(UPDATED_AT);
  });

  it("rejects tenantId, userId, permission, deletedAt and updatedAt fields", async () => {
    const payloads = [
      createPayload({ tenantId: "tenant-1" }),
      createPayload({ userId: "user-1" }),
      createPayload({ permission: "menu.manage" }),
      createPayload({ deletedAt: UPDATED_AT }),
      createPayload({ updatedAt: UPDATED_AT }),
    ];

    for (const payload of payloads) {
      const result = await createCategoryAction(payload);

      expect(result).toEqual({
        ok: false,
        code: "INVALID_INPUT",
        message: getOrderErrorMessage("INVALID_INPUT"),
      });
    }

    expect(mockedCreateMenuCategory).not.toHaveBeenCalled();
  });

  it("rejects foreign fields", async () => {
    const payloads = [
      createPayload({ actor: "user-1" }),
      createPayload({ id: "category-9" }),
      createPayload({ foo: "bar" }),
    ];

    for (const payload of payloads) {
      const result = await createCategoryAction(payload);

      expect(result.ok).toBe(false);
    }

    expect(mockedCreateMenuCategory).not.toHaveBeenCalled();
  });

  it("maps CATEGORY_NAME_CONFLICT to a safe failure", async () => {
    mockedCreateMenuCategory.mockRejectedValue(new OrderDomainError("CATEGORY_NAME_CONFLICT"));

    const result = await createCategoryAction(createPayload());

    expect(result).toEqual({
      ok: false,
      code: "CATEGORY_NAME_CONFLICT",
      message: getOrderErrorMessage("CATEGORY_NAME_CONFLICT"),
    });
  });
});

describe("updateCategoryAction", () => {
  it("forwards a valid payload to the service", async () => {
    const result = await updateCategoryAction(updatePayload());

    expect(result.ok).toBe(true);
    expect(mockedUpdateMenuCategory).toHaveBeenCalledTimes(1);
    expect(mockedUpdateMenuCategory).toHaveBeenCalledWith({
      outletId: "outlet-1",
      categoryId: "category-1",
      expectedUpdatedAt: UPDATED_AT,
      name: "Kopi Susu",
    });
  });

  it("keeps expectedUpdatedAt as the client ISO string", async () => {
    const expectedUpdatedAt = "2026-03-09T04:05:06.789Z";

    await updateCategoryAction(updatePayload({ expectedUpdatedAt }));

    const argument = mockedUpdateMenuCategory.mock.calls[0][0] as Record<string, unknown>;

    expect(argument.expectedUpdatedAt).toBe(expectedUpdatedAt);
    expect(argument.expectedUpdatedAt).toEqual(expect.any(String));
    expect(argument.expectedUpdatedAt).not.toBeInstanceOf(Date);
  });

  it("forwards isActive false and sortOrder 0", async () => {
    const result = await updateCategoryAction(
      updatePayload({ name: undefined, isActive: false, sortOrder: 0 })
    );

    expect(result.ok).toBe(true);
    expect(mockedUpdateMenuCategory).toHaveBeenCalledWith({
      outletId: "outlet-1",
      categoryId: "category-1",
      expectedUpdatedAt: UPDATED_AT,
      isActive: false,
      sortOrder: 0,
    });
  });

  it("rejects a payload without any mutable field and skips the service", async () => {
    const result = await updateCategoryAction({
      outletId: "outlet-1",
      categoryId: "category-1",
      expectedUpdatedAt: UPDATED_AT,
    });

    expect(result).toEqual({
      ok: false,
      code: "INVALID_INPUT",
      message: getOrderErrorMessage("INVALID_INPUT"),
    });
    expect(mockedUpdateMenuCategory).not.toHaveBeenCalled();
  });

  it("maps CATALOG_VERSION_CONFLICT to a safe failure", async () => {
    mockedUpdateMenuCategory.mockRejectedValue(new OrderDomainError("CATALOG_VERSION_CONFLICT"));

    const result = await updateCategoryAction(updatePayload());

    expect(result).toEqual({
      ok: false,
      code: "CATALOG_VERSION_CONFLICT",
      message: getOrderErrorMessage("CATALOG_VERSION_CONFLICT"),
    });
  });

  it("maps CATEGORY_NOT_FOUND to a safe failure", async () => {
    mockedUpdateMenuCategory.mockRejectedValue(new OrderDomainError("CATEGORY_NOT_FOUND"));

    const result = await updateCategoryAction(updatePayload());

    expect(result).toEqual({
      ok: false,
      code: "CATEGORY_NOT_FOUND",
      message: getOrderErrorMessage("CATEGORY_NOT_FOUND"),
    });
  });

  it("returns the success summary with an ISO timestamp", async () => {
    const fixture = summaryFixture({
      name: "Kopi Susu",
      isActive: false,
      updatedAt: "2026-03-10T08:00:00.001Z",
    });
    mockedUpdateMenuCategory.mockResolvedValue(fixture);

    const result = await updateCategoryAction(updatePayload());

    expect(result).toEqual({ ok: true, data: fixture });
    expect(result.ok).toBe(true);
    expect(typeof (result.ok ? result.data.updatedAt : null)).toBe("string");
    expect(result.ok ? result.data.updatedAt : null).not.toBeInstanceOf(Date);
  });
});

describe("archiveCategoryAction", () => {
  it("calls archiveMenuCategory exactly once for a valid payload", async () => {
    const result = await archiveCategoryAction(targetPayload());

    expect(result.ok).toBe(true);
    expect(mockedArchiveMenuCategory).toHaveBeenCalledTimes(1);
    expect(mockedArchiveMenuCategory).toHaveBeenCalledWith({
      outletId: "outlet-1",
      categoryId: "category-1",
      expectedUpdatedAt: UPDATED_AT,
    });
  });

  it("rejects a missing or invalid expectedUpdatedAt without calling the service", async () => {
    const payloads = [
      { outletId: "outlet-1", categoryId: "category-1" },
      targetPayload({ expectedUpdatedAt: "not-a-date" }),
      targetPayload({ expectedUpdatedAt: "2026-03-10" }),
    ];

    for (const payload of payloads) {
      const result = await archiveCategoryAction(payload);

      expect(result).toEqual({
        ok: false,
        code: "INVALID_INPUT",
        message: getOrderErrorMessage("INVALID_INPUT"),
      });
    }

    expect(mockedArchiveMenuCategory).not.toHaveBeenCalled();
  });

  it("rejects foreign fields", async () => {
    const payloads = [
      targetPayload({ deletedAt: UPDATED_AT }),
      targetPayload({ name: "Kopi" }),
      targetPayload({ actor: "user-1" }),
    ];

    for (const payload of payloads) {
      const result = await archiveCategoryAction(payload);

      expect(result.ok).toBe(false);
    }

    expect(mockedArchiveMenuCategory).not.toHaveBeenCalled();
  });

  it("maps CATALOG_STATE_CONFLICT to a safe failure", async () => {
    mockedArchiveMenuCategory.mockRejectedValue(new OrderDomainError("CATALOG_STATE_CONFLICT"));

    const result = await archiveCategoryAction(targetPayload());

    expect(result).toEqual({
      ok: false,
      code: "CATALOG_STATE_CONFLICT",
      message: getOrderErrorMessage("CATALOG_STATE_CONFLICT"),
    });
  });

  it("returns a success summary whose deletedAt is an ISO string", async () => {
    const result = await archiveCategoryAction(targetPayload());

    expect(result.ok).toBe(true);

    const data = result.ok ? result.data : null;
    expect(data?.deletedAt).toBe(ARCHIVED_AT);
    expect(typeof data?.deletedAt).toBe("string");
    expect(data?.deletedAt).not.toBeInstanceOf(Date);
    expect(data?.updatedAt).toBe(ARCHIVED_AT);
  });
});

describe("restoreCategoryAction", () => {
  it("calls restoreMenuCategory exactly once for a valid payload", async () => {
    const result = await restoreCategoryAction(targetPayload());

    expect(result.ok).toBe(true);
    expect(mockedRestoreMenuCategory).toHaveBeenCalledTimes(1);
    expect(mockedRestoreMenuCategory).toHaveBeenCalledWith({
      outletId: "outlet-1",
      categoryId: "category-1",
      expectedUpdatedAt: UPDATED_AT,
    });
  });

  it("rejects an invalid payload without calling the service", async () => {
    const payloads = [
      {},
      { outletId: "outlet-1" },
      targetPayload({ categoryId: "   " }),
      targetPayload({ actor: "user-1" }),
    ];

    for (const payload of payloads) {
      const result = await restoreCategoryAction(payload);

      expect(result).toEqual({
        ok: false,
        code: "INVALID_INPUT",
        message: getOrderErrorMessage("INVALID_INPUT"),
      });
    }

    expect(mockedRestoreMenuCategory).not.toHaveBeenCalled();
  });

  it("maps CATEGORY_NAME_CONFLICT to a safe failure", async () => {
    mockedRestoreMenuCategory.mockRejectedValue(new OrderDomainError("CATEGORY_NAME_CONFLICT"));

    const result = await restoreCategoryAction(targetPayload());

    expect(result).toEqual({
      ok: false,
      code: "CATEGORY_NAME_CONFLICT",
      message: getOrderErrorMessage("CATEGORY_NAME_CONFLICT"),
    });
  });

  it("returns a success summary whose deletedAt is null", async () => {
    const result = await restoreCategoryAction(targetPayload());

    expect(result).toEqual({ ok: true, data: summaryFixture({ updatedAt: RESTORED_AT }) });
    expect(result.ok).toBe(true);
    expect(result.ok ? result.data.deletedAt : "missing").toBeNull();
  });

  it("maps an unknown service error to INTERNAL_ERROR without leaking details", async () => {
    mockedRestoreMenuCategory.mockRejectedValue(
      new Error('query failed: SELECT * FROM "MenuCategory" token=SECRET')
    );

    const result = await restoreCategoryAction(targetPayload());

    expect(result).toEqual({
      ok: false,
      code: "INTERNAL_ERROR",
      message: getOrderErrorMessage("INTERNAL_ERROR"),
    });
    expect(JSON.stringify(result)).not.toContain("SELECT");
    expect(JSON.stringify(result)).not.toContain("SECRET");
  });
});

describe("createMenuItemAction", () => {
  it("calls createMenuItem exactly once for a minimum valid payload", async () => {
    const result = await createMenuItemAction({
      outletId: "outlet-1",
      categoryId: "category-1",
      name: "Es Kopi",
      price: 15_000,
    });

    expect(result.ok).toBe(true);
    expect(mockedCreateMenuItem).toHaveBeenCalledTimes(1);
  });

  it("forwards the normalized name, text and URL fields to the service", async () => {
    const result = await createMenuItemAction({
      outletId: "  outlet-1  ",
      categoryId: "  category-1  ",
      name: "  Es Kopi Panas  ",
      price: 12_000,
      description: "  Dingin atau panas  ",
      imageAlt: "  Gelas es kopi  ",
      imageUrl: " https://cdn.example.com/es-kopi.png ",
    });

    expect(result.ok).toBe(true);
    expect(mockedCreateMenuItem).toHaveBeenCalledWith({
      outletId: "outlet-1",
      categoryId: "category-1",
      name: "Es Kopi Panas",
      price: 12_000,
      description: "Dingin atau panas",
      imageAlt: "Gelas es kopi",
      imageUrl: "https://cdn.example.com/es-kopi.png",
    });
  });

  it("turns empty optional text into null", async () => {
    const result = await createMenuItemAction(
      itemCreatePayload({ description: "", imageAlt: "", imageUrl: "" })
    );

    expect(result.ok).toBe(true);
    expect(mockedCreateMenuItem).toHaveBeenCalledWith(
      expect.objectContaining({ description: null, imageAlt: null, imageUrl: null })
    );
  });

  it("forwards explicit price 0, sortOrder 0, isActive false and isSoldOut false", async () => {
    const result = await createMenuItemAction(
      itemCreatePayload({ price: 0, sortOrder: 0, isActive: false, isSoldOut: false })
    );

    expect(result.ok).toBe(true);
    expect(mockedCreateMenuItem).toHaveBeenCalledWith(
      expect.objectContaining({ price: 0, sortOrder: 0, isActive: false, isSoldOut: false })
    );
  });

  it("rejects invalid categoryId, name and price without calling the service", async () => {
    const payloads = [
      itemCreatePayload({ categoryId: "   " }),
      itemCreatePayload({ name: "" }),
      itemCreatePayload({ name: "x".repeat(121) }),
      itemCreatePayload({ price: -1 }),
      itemCreatePayload({ price: 1.5 }),
      itemCreatePayload({ price: "15000" }),
    ];

    for (const payload of payloads) {
      const result = await createMenuItemAction(payload);

      expect(result).toEqual({
        ok: false,
        code: "INVALID_INPUT",
        message: getOrderErrorMessage("INVALID_INPUT"),
      });
    }

    expect(mockedCreateMenuItem).not.toHaveBeenCalled();
  });

  it("rejects tenantId, userId, permission and actor fields", async () => {
    const payloads = [
      itemCreatePayload({ tenantId: "tenant-1" }),
      itemCreatePayload({ userId: "user-1" }),
      itemCreatePayload({ permission: "menu.manage" }),
      itemCreatePayload({ actor: "user-1" }),
    ];

    for (const payload of payloads) {
      const result = await createMenuItemAction(payload);

      expect(result).toEqual({
        ok: false,
        code: "INVALID_INPUT",
        message: getOrderErrorMessage("INVALID_INPUT"),
      });
    }

    expect(mockedCreateMenuItem).not.toHaveBeenCalled();
  });

  it("rejects foreign fields, including a price inside a nested object", async () => {
    const payloads = [
      itemCreatePayload({ deletedAt: UPDATED_AT }),
      itemCreatePayload({ updatedAt: UPDATED_AT }),
      itemCreatePayload({ category: { id: "category-1", price: 5_000 } }),
      itemCreatePayload({ pricing: { price: 5_000 } }),
    ];

    for (const payload of payloads) {
      const result = await createMenuItemAction(payload);

      expect(result).toEqual({
        ok: false,
        code: "INVALID_INPUT",
        message: getOrderErrorMessage("INVALID_INPUT"),
      });
    }

    expect(mockedCreateMenuItem).not.toHaveBeenCalled();
  });

  it("returns the exact success summary and keeps it JSON serializable", async () => {
    const fixture = itemSummaryFixture();
    mockedCreateMenuItem.mockResolvedValue(fixture);

    const result = await createMenuItemAction(itemCreatePayload());

    expect(result).toEqual({ ok: true, data: fixture });
    expect(Object.keys(result)).toEqual(["ok", "data"]);
    expect(Object.keys(fixture).sort()).toEqual([
      "categoryId",
      "deletedAt",
      "id",
      "isActive",
      "isSoldOut",
      "name",
      "price",
      "updatedAt",
    ]);
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    expect(typeof fixture.updatedAt).toBe("string");
    expect(fixture.updatedAt).not.toBeInstanceOf(Date);
  });

  it("maps CATEGORY_NOT_FOUND to a safe failure", async () => {
    mockedCreateMenuItem.mockRejectedValue(new OrderDomainError("CATEGORY_NOT_FOUND"));

    const result = await createMenuItemAction(itemCreatePayload());

    expect(result).toEqual({
      ok: false,
      code: "CATEGORY_NOT_FOUND",
      message: getOrderErrorMessage("CATEGORY_NOT_FOUND"),
    });
  });

  it("maps CATEGORY_NOT_AVAILABLE to a safe failure", async () => {
    mockedCreateMenuItem.mockRejectedValue(new OrderDomainError("CATEGORY_NOT_AVAILABLE"));

    const result = await createMenuItemAction(itemCreatePayload());

    expect(result).toEqual({
      ok: false,
      code: "CATEGORY_NOT_AVAILABLE",
      message: getOrderErrorMessage("CATEGORY_NOT_AVAILABLE"),
    });
  });

  it("maps MENU_NAME_CONFLICT to a safe failure", async () => {
    mockedCreateMenuItem.mockRejectedValue(new OrderDomainError("MENU_NAME_CONFLICT"));

    const result = await createMenuItemAction(itemCreatePayload());

    expect(result).toEqual({
      ok: false,
      code: "MENU_NAME_CONFLICT",
      message: getOrderErrorMessage("MENU_NAME_CONFLICT"),
    });
  });

  it("maps an unknown error to INTERNAL_ERROR without leaking details", async () => {
    mockedCreateMenuItem.mockRejectedValue(new Error('insert into "MenuItem" failed token=SECRET'));

    const result = await createMenuItemAction(itemCreatePayload());

    expect(result).toEqual({
      ok: false,
      code: "INTERNAL_ERROR",
      message: getOrderErrorMessage("INTERNAL_ERROR"),
    });
    expect(JSON.stringify(result)).not.toContain("insert");
    expect(JSON.stringify(result)).not.toContain("SECRET");
    expect(Object.keys(result)).toEqual(["ok", "code", "message"]);
  });
});

describe("updateMenuItemAction", () => {
  it("forwards a valid update payload to the service", async () => {
    const result = await updateMenuItemAction(itemUpdatePayload());

    expect(result.ok).toBe(true);
    expect(mockedUpdateMenuItem).toHaveBeenCalledTimes(1);
    expect(mockedUpdateMenuItem).toHaveBeenCalledWith({
      outletId: "outlet-1",
      menuItemId: "menu-1",
      expectedUpdatedAt: UPDATED_AT,
      name: "Es Kopi Susu",
    });
  });

  it("accepts an update that only changes categoryId", async () => {
    const result = await updateMenuItemAction({
      outletId: "outlet-1",
      menuItemId: "menu-1",
      expectedUpdatedAt: UPDATED_AT,
      categoryId: "category-2",
    });

    expect(result.ok).toBe(true);
    expect(mockedUpdateMenuItem).toHaveBeenCalledWith({
      outletId: "outlet-1",
      menuItemId: "menu-1",
      expectedUpdatedAt: UPDATED_AT,
      categoryId: "category-2",
    });
  });

  it("keeps expectedUpdatedAt as the client ISO string", async () => {
    const expectedUpdatedAt = "2026-03-09T04:05:06.789Z";

    await updateMenuItemAction(itemUpdatePayload({ expectedUpdatedAt }));

    const argument = mockedUpdateMenuItem.mock.calls[0][0] as Record<string, unknown>;

    expect(argument.expectedUpdatedAt).toBe(expectedUpdatedAt);
    expect(argument.expectedUpdatedAt).toEqual(expect.any(String));
    expect(argument.expectedUpdatedAt).not.toBeInstanceOf(Date);
  });

  it("preserves null, false and zero values", async () => {
    const result = await updateMenuItemAction(
      itemUpdatePayload({
        name: undefined,
        description: "",
        imageUrl: "",
        imageAlt: "",
        price: 0,
        sortOrder: 0,
        isActive: false,
        isSoldOut: false,
      })
    );

    expect(result.ok).toBe(true);
    expect(mockedUpdateMenuItem).toHaveBeenCalledWith(
      expect.objectContaining({
        description: null,
        imageUrl: null,
        imageAlt: null,
        price: 0,
        sortOrder: 0,
        isActive: false,
        isSoldOut: false,
      })
    );
  });

  it("rejects a payload without any mutable field and skips the service", async () => {
    const result = await updateMenuItemAction({
      outletId: "outlet-1",
      menuItemId: "menu-1",
      expectedUpdatedAt: UPDATED_AT,
    });

    expect(result).toEqual({
      ok: false,
      code: "INVALID_INPUT",
      message: getOrderErrorMessage("INVALID_INPUT"),
    });
    expect(mockedUpdateMenuItem).not.toHaveBeenCalled();
  });

  it("rejects an invalid expectedUpdatedAt timestamp", async () => {
    for (const expectedUpdatedAt of ["not-a-date", "2026-03-10", ""]) {
      const result = await updateMenuItemAction(itemUpdatePayload({ expectedUpdatedAt }));

      expect(result).toEqual({
        ok: false,
        code: "INVALID_INPUT",
        message: getOrderErrorMessage("INVALID_INPUT"),
      });
    }

    expect(mockedUpdateMenuItem).not.toHaveBeenCalled();
  });

  it("rejects foreign fields", async () => {
    const payloads = [
      itemUpdatePayload({ tenantId: "tenant-1" }),
      itemUpdatePayload({ actor: "user-1" }),
      itemUpdatePayload({ deletedAt: UPDATED_AT }),
      itemUpdatePayload({ updatedAt: UPDATED_AT }),
      itemUpdatePayload({ id: "menu-9" }),
    ];

    for (const payload of payloads) {
      const result = await updateMenuItemAction(payload);

      expect(result.ok).toBe(false);
    }

    expect(mockedUpdateMenuItem).not.toHaveBeenCalled();
  });

  it("maps MENU_ITEM_NOT_FOUND to a safe failure", async () => {
    mockedUpdateMenuItem.mockRejectedValue(new OrderDomainError("MENU_ITEM_NOT_FOUND"));

    const result = await updateMenuItemAction(itemUpdatePayload());

    expect(result).toEqual({
      ok: false,
      code: "MENU_ITEM_NOT_FOUND",
      message: getOrderErrorMessage("MENU_ITEM_NOT_FOUND"),
    });
  });

  it("maps MENU_NAME_CONFLICT to a safe failure", async () => {
    mockedUpdateMenuItem.mockRejectedValue(new OrderDomainError("MENU_NAME_CONFLICT"));

    const result = await updateMenuItemAction(itemUpdatePayload());

    expect(result).toEqual({
      ok: false,
      code: "MENU_NAME_CONFLICT",
      message: getOrderErrorMessage("MENU_NAME_CONFLICT"),
    });
  });

  it("maps CATEGORY_NOT_AVAILABLE to a safe failure", async () => {
    mockedUpdateMenuItem.mockRejectedValue(new OrderDomainError("CATEGORY_NOT_AVAILABLE"));

    const result = await updateMenuItemAction(itemUpdatePayload({ categoryId: "category-2" }));

    expect(result).toEqual({
      ok: false,
      code: "CATEGORY_NOT_AVAILABLE",
      message: getOrderErrorMessage("CATEGORY_NOT_AVAILABLE"),
    });
  });

  it("maps CATALOG_VERSION_CONFLICT to a safe failure", async () => {
    mockedUpdateMenuItem.mockRejectedValue(new OrderDomainError("CATALOG_VERSION_CONFLICT"));

    const result = await updateMenuItemAction(itemUpdatePayload());

    expect(result).toEqual({
      ok: false,
      code: "CATALOG_VERSION_CONFLICT",
      message: getOrderErrorMessage("CATALOG_VERSION_CONFLICT"),
    });
  });

  it("returns the success summary with an ISO timestamp", async () => {
    const fixture = itemSummaryFixture({
      name: "Es Kopi Susu",
      price: 17_000,
      updatedAt: "2026-03-10T08:00:00.001Z",
    });
    mockedUpdateMenuItem.mockResolvedValue(fixture);

    const result = await updateMenuItemAction(itemUpdatePayload());

    expect(result).toEqual({ ok: true, data: fixture });
    expect(result.ok).toBe(true);
    expect(typeof (result.ok ? result.data.updatedAt : null)).toBe("string");
    expect(result.ok ? result.data.updatedAt : null).not.toBeInstanceOf(Date);
    expect(result.ok ? result.data.deletedAt : "missing").toBeNull();
  });
});

describe("archiveMenuItemAction", () => {
  it("forwards a valid payload to the service", async () => {
    const result = await archiveMenuItemAction(itemTargetPayload());

    expect(result.ok).toBe(true);
    expect(mockedArchiveMenuItem).toHaveBeenCalledTimes(1);
    expect(mockedArchiveMenuItem).toHaveBeenCalledWith({
      outletId: "outlet-1",
      menuItemId: "menu-1",
      expectedUpdatedAt: UPDATED_AT,
    });
  });

  it("rejects a missing or invalid concurrency token without calling the service", async () => {
    const payloads = [
      { outletId: "outlet-1", menuItemId: "menu-1" },
      itemTargetPayload({ expectedUpdatedAt: "not-a-date" }),
      itemTargetPayload({ expectedUpdatedAt: "2026-03-10" }),
    ];

    for (const payload of payloads) {
      const result = await archiveMenuItemAction(payload);

      expect(result).toEqual({
        ok: false,
        code: "INVALID_INPUT",
        message: getOrderErrorMessage("INVALID_INPUT"),
      });
    }

    expect(mockedArchiveMenuItem).not.toHaveBeenCalled();
  });

  it("maps CATALOG_STATE_CONFLICT to a safe failure", async () => {
    mockedArchiveMenuItem.mockRejectedValue(new OrderDomainError("CATALOG_STATE_CONFLICT"));

    const result = await archiveMenuItemAction(itemTargetPayload());

    expect(result).toEqual({
      ok: false,
      code: "CATALOG_STATE_CONFLICT",
      message: getOrderErrorMessage("CATALOG_STATE_CONFLICT"),
    });
  });

  it("returns a success summary whose deletedAt is an ISO string", async () => {
    const result = await archiveMenuItemAction(itemTargetPayload());

    expect(result.ok).toBe(true);

    const data = result.ok ? result.data : null;
    expect(data?.deletedAt).toBe(ARCHIVED_AT);
    expect(typeof data?.deletedAt).toBe("string");
    expect(data?.deletedAt).not.toBeInstanceOf(Date);
    expect(data?.updatedAt).toBe(ARCHIVED_AT);
  });
});

describe("restoreMenuItemAction", () => {
  it("forwards a valid payload to the service", async () => {
    const result = await restoreMenuItemAction(itemTargetPayload());

    expect(result.ok).toBe(true);
    expect(mockedRestoreMenuItem).toHaveBeenCalledTimes(1);
    expect(mockedRestoreMenuItem).toHaveBeenCalledWith({
      outletId: "outlet-1",
      menuItemId: "menu-1",
      expectedUpdatedAt: UPDATED_AT,
    });
  });

  it("rejects foreign fields without calling the service", async () => {
    const payloads = [
      itemTargetPayload({ tenantId: "tenant-1" }),
      itemTargetPayload({ actor: "user-1" }),
      itemTargetPayload({ name: "Es Kopi" }),
      itemTargetPayload({ deletedAt: UPDATED_AT }),
    ];

    for (const payload of payloads) {
      const result = await restoreMenuItemAction(payload);

      expect(result).toEqual({
        ok: false,
        code: "INVALID_INPUT",
        message: getOrderErrorMessage("INVALID_INPUT"),
      });
    }

    expect(mockedRestoreMenuItem).not.toHaveBeenCalled();
  });

  it("maps MENU_NAME_CONFLICT to a safe failure", async () => {
    mockedRestoreMenuItem.mockRejectedValue(new OrderDomainError("MENU_NAME_CONFLICT"));

    const result = await restoreMenuItemAction(itemTargetPayload());

    expect(result).toEqual({
      ok: false,
      code: "MENU_NAME_CONFLICT",
      message: getOrderErrorMessage("MENU_NAME_CONFLICT"),
    });
  });

  it("maps CATALOG_STATE_CONFLICT to a safe failure", async () => {
    mockedRestoreMenuItem.mockRejectedValue(new OrderDomainError("CATALOG_STATE_CONFLICT"));

    const result = await restoreMenuItemAction(itemTargetPayload());

    expect(result).toEqual({
      ok: false,
      code: "CATALOG_STATE_CONFLICT",
      message: getOrderErrorMessage("CATALOG_STATE_CONFLICT"),
    });
  });

  it("returns a success summary whose deletedAt is null", async () => {
    const result = await restoreMenuItemAction(itemTargetPayload());

    expect(result).toEqual({ ok: true, data: itemSummaryFixture({ updatedAt: RESTORED_AT }) });
    expect(result.ok).toBe(true);
    expect(result.ok ? result.data.deletedAt : "missing").toBeNull();
  });
});

describe("setMenuItemSoldOutAction", () => {
  it("forwards isSoldOut false to the service", async () => {
    mockedSetMenuItemSoldOut.mockResolvedValue(itemSummaryFixture({ updatedAt: RESTORED_AT }));

    const result = await setMenuItemSoldOutAction(itemTargetPayload({ isSoldOut: false }));

    expect(result.ok).toBe(true);
    expect(mockedSetMenuItemSoldOut).toHaveBeenCalledTimes(1);
    expect(mockedSetMenuItemSoldOut).toHaveBeenCalledWith({
      outletId: "outlet-1",
      menuItemId: "menu-1",
      expectedUpdatedAt: UPDATED_AT,
      isSoldOut: false,
    });
  });

  it("forwards isSoldOut true to the service", async () => {
    const result = await setMenuItemSoldOutAction(itemTargetPayload({ isSoldOut: true }));

    expect(result.ok).toBe(true);
    expect(mockedSetMenuItemSoldOut).toHaveBeenCalledWith(
      expect.objectContaining({ isSoldOut: true })
    );
  });

  it("rejects string booleans for isSoldOut", async () => {
    for (const isSoldOut of ["true", "false"]) {
      const result = await setMenuItemSoldOutAction(itemTargetPayload({ isSoldOut }));

      expect(result).toEqual({
        ok: false,
        code: "INVALID_INPUT",
        message: getOrderErrorMessage("INVALID_INPUT"),
      });
    }

    expect(mockedSetMenuItemSoldOut).not.toHaveBeenCalled();
  });

  it("rejects a payload without isSoldOut and skips the service", async () => {
    const result = await setMenuItemSoldOutAction(itemTargetPayload());

    expect(result).toEqual({
      ok: false,
      code: "INVALID_INPUT",
      message: getOrderErrorMessage("INVALID_INPUT"),
    });
    expect(mockedSetMenuItemSoldOut).not.toHaveBeenCalled();
  });

  it("maps a stale concurrency token error to a safe failure", async () => {
    mockedSetMenuItemSoldOut.mockRejectedValue(new OrderDomainError("CATALOG_VERSION_CONFLICT"));

    const result = await setMenuItemSoldOutAction(itemTargetPayload({ isSoldOut: true }));

    expect(result).toEqual({
      ok: false,
      code: "CATALOG_VERSION_CONFLICT",
      message: getOrderErrorMessage("CATALOG_VERSION_CONFLICT"),
    });
  });

  it("maps MENU_ITEM_NOT_FOUND to a safe failure", async () => {
    mockedSetMenuItemSoldOut.mockRejectedValue(new OrderDomainError("MENU_ITEM_NOT_FOUND"));

    const result = await setMenuItemSoldOutAction(itemTargetPayload({ isSoldOut: true }));

    expect(result).toEqual({
      ok: false,
      code: "MENU_ITEM_NOT_FOUND",
      message: getOrderErrorMessage("MENU_ITEM_NOT_FOUND"),
    });
  });

  it("forwards a successful sold-out mutation summary", async () => {
    const fixture = itemSummaryFixture({ isSoldOut: true, updatedAt: RESTORED_AT });
    mockedSetMenuItemSoldOut.mockResolvedValue(fixture);

    const result = await setMenuItemSoldOutAction(itemTargetPayload({ isSoldOut: true }));

    expect(result).toEqual({ ok: true, data: fixture });
    expect(result.ok).toBe(true);
    expect(result.ok ? result.data.isSoldOut : null).toBe(true);
  });

  it("treats a no-op result as a success", async () => {
    const fixture = itemSummaryFixture({ isSoldOut: false, updatedAt: RESTORED_AT });
    mockedSetMenuItemSoldOut.mockResolvedValue(fixture);

    const result = await setMenuItemSoldOutAction(itemTargetPayload({ isSoldOut: false }));

    expect(result).toEqual({ ok: true, data: fixture });
    expect(result.ok).toBe(true);
    expect(result.ok ? result.data.isSoldOut : null).toBe(false);
  });

  it("keeps timestamps as strings and deletedAt as a string or null", async () => {
    const result = await setMenuItemSoldOutAction(itemTargetPayload({ isSoldOut: true }));

    expect(result.ok).toBe(true);

    const data = result.ok ? result.data : null;
    expect(typeof data?.updatedAt).toBe("string");
    expect(data?.updatedAt).not.toBeInstanceOf(Date);
    expect(data?.deletedAt === null || typeof data?.deletedAt === "string").toBe(true);
    expect(data?.deletedAt).not.toBeInstanceOf(Date);
  });

  it("does not call the service for invalid payloads", async () => {
    const payloads = [
      {},
      itemTargetPayload({ isSoldOut: "yes" }),
      itemTargetPayload({ isSoldOut: 1 }),
      itemTargetPayload({ expectedUpdatedAt: "not-a-date", isSoldOut: true }),
      itemTargetPayload({ isSoldOut: true, tenantId: "tenant-1" }),
    ];

    for (const payload of payloads) {
      const result = await setMenuItemSoldOutAction(payload);

      expect(result.ok).toBe(false);
    }

    expect(mockedSetMenuItemSoldOut).not.toHaveBeenCalled();
  });
});

describe("action security (every action)", () => {
  const everyAction = [
    { call: createCategoryAction, base: createPayload(), service: () => mockedCreateMenuCategory },
    { call: updateCategoryAction, base: updatePayload(), service: () => mockedUpdateMenuCategory },
    {
      call: archiveCategoryAction,
      base: targetPayload(),
      service: () => mockedArchiveMenuCategory,
    },
    {
      call: restoreCategoryAction,
      base: targetPayload(),
      service: () => mockedRestoreMenuCategory,
    },
    { call: createMenuItemAction, base: itemCreatePayload(), service: () => mockedCreateMenuItem },
    { call: updateMenuItemAction, base: itemUpdatePayload(), service: () => mockedUpdateMenuItem },
    {
      call: archiveMenuItemAction,
      base: itemTargetPayload(),
      service: () => mockedArchiveMenuItem,
    },
    {
      call: restoreMenuItemAction,
      base: itemTargetPayload(),
      service: () => mockedRestoreMenuItem,
    },
    {
      call: setMenuItemSoldOutAction,
      base: itemTargetPayload({ isSoldOut: true }),
      service: () => mockedSetMenuItemSoldOut,
    },
  ];

  it("rejects actor, tenantId, userId and permission fields on every action", async () => {
    for (const action of everyAction) {
      for (const field of ["actor", "tenantId", "userId", "permission"]) {
        const result = await action.call({ ...action.base, [field]: "injected" });

        expect(result).toEqual({
          ok: false,
          code: "INVALID_INPUT",
          message: getOrderErrorMessage("INVALID_INPUT"),
        });
      }
    }

    for (const action of everyAction) {
      expect(action.service()).not.toHaveBeenCalled();
    }
  });

  it("never rewrites the outletId sent by the client", async () => {
    for (const [index, action] of everyAction.entries()) {
      const outletId = ` outlet-${index} `;

      await action.call({ ...action.base, outletId });

      expect(action.service().mock.calls[0][0]).toMatchObject({
        outletId: `outlet-${index}`,
      });
    }
  });

  it("returns only ok, code and message on every failure", async () => {
    for (const action of everyAction) {
      action.service().mockRejectedValue(new OrderDomainError("MENU_ITEM_NOT_FOUND"));
      action.service().mockRejectedValueOnce(new Error("boom"));
    }

    const results = await Promise.all([
      ...everyAction.map((action) => action.call(action.base)),
      ...everyAction.map((action) => action.call({})),
    ]);

    for (const result of results) {
      expect(result.ok).toBe(false);

      if (result.ok) {
        continue;
      }

      expect(Object.keys(result)).toEqual(["ok", "code", "message"]);
      expect(typeof result.code).toBe("string");
      expect(typeof result.message).toBe("string");
    }

    const serialized = JSON.stringify(results);
    expect(serialized).not.toContain("boom");
    expect(serialized).not.toContain("stack");
  });

  it("returns only ok and data on every success", async () => {
    const categoryKeys = ["deletedAt", "id", "isActive", "name", "sortOrder", "updatedAt"];
    const itemKeys = [
      "categoryId",
      "deletedAt",
      "id",
      "isActive",
      "isSoldOut",
      "name",
      "price",
      "updatedAt",
    ];

    const results = await Promise.all(everyAction.map((action) => action.call(action.base)));

    for (const result of results) {
      expect(result.ok).toBe(true);

      if (!result.ok) {
        continue;
      }

      expect(Object.keys(result)).toEqual(["ok", "data"]);

      const dataKeys = Object.keys(result.data).sort();
      expect(dataKeys).toEqual(dataKeys.includes("price") ? itemKeys : categoryKeys);
      expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    }
  });
});
