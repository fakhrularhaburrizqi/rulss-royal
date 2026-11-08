import { NextRequest, NextResponse } from "next/server";

import { parseReportRange } from "@/lib/dashboard/report-range";
import { buildSalesReportCsv } from "@/lib/dashboard/sales-report-csv";
import { listReportOrders } from "@/lib/dashboard/sales-report";
import { requireOrderContext } from "@/lib/order/context";
import { OrderDomainError } from "@/lib/order/errors";

const ERROR_STATUS: Readonly<Record<string, number>> = {
  UNAUTHENTICATED: 401,
  OUTLET_ACCESS_DENIED: 403,
  OUTLET_NOT_FOUND: 404,
  INVALID_INPUT: 400,
};

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const outletId = searchParams.get("outlet") ?? "";
  const params = Object.fromEntries(searchParams.entries());

  let context: Awaited<ReturnType<typeof requireOrderContext>>;
  try {
    context = await requireOrderContext(outletId, "orders.manage");
  } catch (error) {
    const code = error instanceof OrderDomainError ? error.code : "INTERNAL_ERROR";
    return NextResponse.json({ code }, { status: ERROR_STATUS[code] ?? 500 });
  }

  const range = parseReportRange(params);

  try {
    const rows = await listReportOrders(context.actor.tenantId, context.outletId, range);
    const csv = buildSalesReportCsv(rows);

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="laporan-penjualan-${range.startKey}-${range.endKey}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json({ code: "INTERNAL_ERROR" }, { status: 500 });
  }
}
