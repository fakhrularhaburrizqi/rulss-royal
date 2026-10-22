"use server";

import { type OrderErrorCode, getOrderErrorMessage, toOrderError } from "@/lib/order/errors";
import {
  createDiningTable,
  deactivateDiningTable,
  generateQrToken,
  getTableQrToken,
  reactivateDiningTable,
  updateDiningTable,
  type DiningTableSummary,
} from "@/lib/services/dining-table.service";
import {
  generateTableTokenSchema,
  tableCreateSchema,
  tableDeactivateSchema,
  tableReactivateSchema,
  tableUpdateSchema,
} from "@/lib/validators/table.validator";

export type TableActionFailure = {
  ok: false;
  code: OrderErrorCode;
  message: string;
};

export type TableActionSuccess = {
  ok: true;
  data: DiningTableSummary;
};

export type TableTokenSuccess = {
  ok: true;
  data: { token: string };
};

export type TableActionResult = TableActionSuccess | TableActionFailure;
export type TableTokenResult = TableTokenSuccess | TableActionFailure;

function failure(code: OrderErrorCode): TableActionFailure {
  return { ok: false, code, message: getOrderErrorMessage(code) };
}

export async function createTableAction(payload: unknown): Promise<TableActionResult> {
  const parsed = tableCreateSchema.safeParse(payload);
  if (!parsed.success) {
    return failure("INVALID_INPUT");
  }

  try {
    const summary = await createDiningTable(parsed.data);

    return { ok: true, data: summary };
  } catch (error) {
    const mapped = toOrderError(error);
    return failure(mapped.code);
  }
}

export async function updateTableAction(payload: unknown): Promise<TableActionResult> {
  const parsed = tableUpdateSchema.safeParse(payload);
  if (!parsed.success) {
    return failure("INVALID_INPUT");
  }

  try {
    const summary = await updateDiningTable(parsed.data);

    return { ok: true, data: summary };
  } catch (error) {
    const mapped = toOrderError(error);
    return failure(mapped.code);
  }
}

export async function deactivateTableAction(payload: unknown): Promise<TableActionResult> {
  const parsed = tableDeactivateSchema.safeParse(payload);
  if (!parsed.success) {
    return failure("INVALID_INPUT");
  }

  try {
    const summary = await deactivateDiningTable(parsed.data);

    return { ok: true, data: summary };
  } catch (error) {
    const mapped = toOrderError(error);
    return failure(mapped.code);
  }
}

export async function reactivateTableAction(payload: unknown): Promise<TableActionResult> {
  const parsed = tableReactivateSchema.safeParse(payload);
  if (!parsed.success) {
    return failure("INVALID_INPUT");
  }

  try {
    const summary = await reactivateDiningTable(parsed.data);

    return { ok: true, data: summary };
  } catch (error) {
    const mapped = toOrderError(error);
    return failure(mapped.code);
  }
}

export async function generateTableTokenAction(payload: unknown): Promise<TableTokenResult> {
  const parsed = generateTableTokenSchema.safeParse(payload);
  if (!parsed.success) {
    return failure("INVALID_INPUT");
  }

  try {
    const token = await generateQrToken(parsed.data);
    return { ok: true, data: { token } };
  } catch (error) {
    const mapped = toOrderError(error);
    return failure(mapped.code);
  }
}

export async function getTableQrAction(payload: unknown): Promise<TableTokenResult> {
  const parsed = generateTableTokenSchema.safeParse(payload);
  if (!parsed.success) {
    return failure("INVALID_INPUT");
  }

  try {
    const token = await getTableQrToken(parsed.data);
    return { ok: true, data: { token: token ?? "" } };
  } catch (error) {
    const mapped = toOrderError(error);
    return failure(mapped.code);
  }
}
