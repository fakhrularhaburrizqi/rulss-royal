"use server";

import { type OrderErrorCode, getOrderErrorMessage, toOrderError } from "@/lib/order/errors";
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

export type MenuActionFailure = {
  ok: false;
  code: OrderErrorCode;
  message: string;
};

export type CategoryActionSuccess = {
  ok: true;
  data: CategorySummary;
};

export type CategoryActionResult = CategoryActionSuccess | MenuActionFailure;

export type MenuItemActionSuccess = {
  ok: true;
  data: MenuItemSummary;
};

export type MenuItemActionResult = MenuItemActionSuccess | MenuActionFailure;

function failure(code: OrderErrorCode): MenuActionFailure {
  return { ok: false, code, message: getOrderErrorMessage(code) };
}

export async function createCategoryAction(payload: unknown): Promise<CategoryActionResult> {
  const parsed = categoryCreateSchema.safeParse(payload);
  if (!parsed.success) {
    return failure("INVALID_INPUT");
  }

  try {
    const summary = await createMenuCategory(parsed.data);

    return { ok: true, data: summary };
  } catch (error) {
    const mapped = toOrderError(error);
    return failure(mapped.code);
  }
}

export async function updateCategoryAction(payload: unknown): Promise<CategoryActionResult> {
  const parsed = categoryUpdateSchema.safeParse(payload);
  if (!parsed.success) {
    return failure("INVALID_INPUT");
  }

  try {
    const summary = await updateMenuCategory(parsed.data);

    return { ok: true, data: summary };
  } catch (error) {
    const mapped = toOrderError(error);
    return failure(mapped.code);
  }
}

export async function archiveCategoryAction(payload: unknown): Promise<CategoryActionResult> {
  const parsed = categoryArchiveSchema.safeParse(payload);
  if (!parsed.success) {
    return failure("INVALID_INPUT");
  }

  try {
    const summary = await archiveMenuCategory(parsed.data);

    return { ok: true, data: summary };
  } catch (error) {
    const mapped = toOrderError(error);
    return failure(mapped.code);
  }
}

export async function restoreCategoryAction(payload: unknown): Promise<CategoryActionResult> {
  const parsed = categoryRestoreSchema.safeParse(payload);
  if (!parsed.success) {
    return failure("INVALID_INPUT");
  }

  try {
    const summary = await restoreMenuCategory(parsed.data);

    return { ok: true, data: summary };
  } catch (error) {
    const mapped = toOrderError(error);
    return failure(mapped.code);
  }
}

export async function createMenuItemAction(payload: unknown): Promise<MenuItemActionResult> {
  const parsed = menuItemCreateSchema.safeParse(payload);
  if (!parsed.success) {
    return failure("INVALID_INPUT");
  }

  try {
    const summary = await createMenuItem(parsed.data);

    return { ok: true, data: summary };
  } catch (error) {
    const mapped = toOrderError(error);
    return failure(mapped.code);
  }
}

export async function updateMenuItemAction(payload: unknown): Promise<MenuItemActionResult> {
  const parsed = menuItemUpdateSchema.safeParse(payload);
  if (!parsed.success) {
    return failure("INVALID_INPUT");
  }

  try {
    const summary = await updateMenuItem(parsed.data);

    return { ok: true, data: summary };
  } catch (error) {
    const mapped = toOrderError(error);
    return failure(mapped.code);
  }
}

export async function archiveMenuItemAction(payload: unknown): Promise<MenuItemActionResult> {
  const parsed = menuItemArchiveSchema.safeParse(payload);
  if (!parsed.success) {
    return failure("INVALID_INPUT");
  }

  try {
    const summary = await archiveMenuItem(parsed.data);

    return { ok: true, data: summary };
  } catch (error) {
    const mapped = toOrderError(error);
    return failure(mapped.code);
  }
}

export async function restoreMenuItemAction(payload: unknown): Promise<MenuItemActionResult> {
  const parsed = menuItemRestoreSchema.safeParse(payload);
  if (!parsed.success) {
    return failure("INVALID_INPUT");
  }

  try {
    const summary = await restoreMenuItem(parsed.data);

    return { ok: true, data: summary };
  } catch (error) {
    const mapped = toOrderError(error);
    return failure(mapped.code);
  }
}

export async function setMenuItemSoldOutAction(payload: unknown): Promise<MenuItemActionResult> {
  const parsed = menuItemSoldOutSchema.safeParse(payload);
  if (!parsed.success) {
    return failure("INVALID_INPUT");
  }

  try {
    const summary = await setMenuItemSoldOut(parsed.data);

    return { ok: true, data: summary };
  } catch (error) {
    const mapped = toOrderError(error);
    return failure(mapped.code);
  }
}
