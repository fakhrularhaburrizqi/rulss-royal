import { NextRequest, NextResponse } from "next/server";
import { listTablesForManagement } from "@/lib/services/dining-table.service";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const outletId = searchParams.get("outletId") ?? searchParams.get("outlet");

  if (!outletId) {
    return NextResponse.json({ code: "INVALID_INPUT", message: "outletId wajib diisi" }, { status: 400 });
  }

  try {
    const tables = await listTablesForManagement(outletId);
    return NextResponse.json(tables);
  } catch (error) {
    const status = (error as { status?: number }).status ?? 500;
    const code = (error as { code?: string }).code ?? "INTERNAL_ERROR";
    const message = (error as { message?: string }).message ?? "Terjadi kesalahan";
    return NextResponse.json({ code, message }, { status });
  }
}
