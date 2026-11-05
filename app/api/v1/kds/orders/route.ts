import { NextRequest, NextResponse } from "next/server";

import { listKdsOrdersForOutlet } from "@/lib/services/kds-query.service";
import type { OrderErrorCode } from "@/lib/order/errors";

const DOMAIN_ERROR_STATUS: Partial<Record<OrderErrorCode, number>> = {
  UNAUTHENTICATED: 401,
  OUTLET_ACCESS_DENIED: 403,
  OUTLET_NOT_FOUND: 404,
  INVALID_INPUT: 400,
};

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const outletId = searchParams.get("outletId") ?? searchParams.get("outlet");

  if (!outletId) {
    return NextResponse.json(
      { code: "INVALID_INPUT", message: "outletId wajib diisi" },
      { status: 400 }
    );
  }

  try {
    const orders = await listKdsOrdersForOutlet(outletId);
    return NextResponse.json(orders);
  } catch (error) {
    const code = (error as { code?: string }).code ?? "INTERNAL_ERROR";
    const message = (error as { message?: string }).message ?? "Terjadi kesalahan";
    const status = DOMAIN_ERROR_STATUS[code as OrderErrorCode] ?? 500;
    return NextResponse.json({ code, message }, { status });
  }
}
