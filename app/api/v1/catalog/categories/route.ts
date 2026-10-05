import { NextRequest, NextResponse } from "next/server";

import { listMenuCategoriesPaginated } from "@/lib/services/menu-category-query.service";
import { catalogListQuerySchema } from "@/lib/validators/category-query";
import { OrderDomainError } from "@/lib/order/errors";

function decodeCursorPayload(raw: string): { v: 1; sortOrder: number; name: string; id: string; outletId: string; filter: string; search: string | undefined } | null {
  try {
    const decoded = Buffer.from(raw, "base64url").toString("utf-8");
    const parsed = JSON.parse(decoded);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      parsed.v !== 1 ||
      typeof parsed.sortOrder !== "number" ||
      typeof parsed.name !== "string" ||
      typeof parsed.id !== "string" ||
      typeof parsed.outletId !== "string" ||
      typeof parsed.filter !== "string" ||
      (parsed.search !== undefined && typeof parsed.search !== "string")
    ) {
      return null;
    }
    return parsed as {
      v: 1;
      sortOrder: number;
      name: string;
      id: string;
      outletId: string;
      filter: string;
      search: string | undefined;
    };
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const requestId = crypto.randomUUID();

  const { searchParams } = new URL(request.url);

  if (searchParams.getAll("outlet").length > 1) {
    return NextResponse.json(
      { code: "INVALID_INPUT", message: "Parameter duplikat: outlet", details: null, requestId: crypto.randomUUID() },
      { status: 400, headers: { "Cache-Control": "private, no-store, must-revalidate", "X-Request-Id": crypto.randomUUID() } }
    );
  }
  if (searchParams.getAll("limit").length > 1) {
    return NextResponse.json(
      { code: "INVALID_INPUT", message: "Parameter duplikat: limit", details: null, requestId: crypto.randomUUID() },
      { status: 400, headers: { "Cache-Control": "private, no-store, must-revalidate", "X-Request-Id": crypto.randomUUID() } }
    );
  }
  if (searchParams.getAll("filter").length > 1) {
    return NextResponse.json(
      { code: "INVALID_INPUT", message: "Parameter duplikat: filter", details: null, requestId: crypto.randomUUID() },
      { status: 400, headers: { "Cache-Control": "private, no-store, must-revalidate", "X-Request-Id": crypto.randomUUID() } }
    );
  }
  if (searchParams.getAll("search").length > 1) {
    return NextResponse.json(
      { code: "INVALID_INPUT", message: "Parameter duplikat: search", details: null, requestId: crypto.randomUUID() },
      { status: 400, headers: { "Cache-Control": "private, no-store, must-revalidate", "X-Request-Id": crypto.randomUUID() } }
    );
  }
  if (searchParams.getAll("cursor").length > 1) {
    return NextResponse.json(
      { code: "INVALID_INPUT", message: "Parameter duplikat: cursor", details: null, requestId: crypto.randomUUID() },
      { status: 400, headers: { "Cache-Control": "private, no-store, must-revalidate", "X-Request-Id": crypto.randomUUID() } }
    );
  }

  const rawInput = {
    outlet: searchParams.get("outlet"),
    limit: searchParams.get("limit") ?? "50",
    filter: searchParams.get("filter") ?? "all",
    search: searchParams.get("search") ?? undefined,
    cursor: searchParams.get("cursor") ?? undefined,
  };

  const parsedResult = catalogListQuerySchema.safeParse(rawInput);

  if (!parsedResult.success) {
    const details = parsedResult.error.flatten().fieldErrors;
    return NextResponse.json(
      { code: "INVALID_INPUT", message: "Parameter tidak valid", details, requestId: crypto.randomUUID() },
      { status: 400, headers: { "Cache-Control": "private, no-store, must-revalidate", "X-Request-Id": crypto.randomUUID() } }
    );
  }

  const rawCursor = searchParams.get("cursor");
  if (rawCursor !== undefined && rawCursor !== null) {
    const cursorPayload = decodeCursorPayload(rawCursor);
    if (cursorPayload === null) {
      return NextResponse.json(
        { code: "INVALID_INPUT", message: "Cursor tidak valid", details: null, requestId: crypto.randomUUID() },
        { status: 400, headers: { "Cache-Control": "private, no-store, must-revalidate", "X-Request-Id": crypto.randomUUID() } }
      );
    }
  }

  try {
    const result = await listMenuCategoriesPaginated(rawInput);

    return NextResponse.json(
      { data: result.data, nextCursor: result.nextCursor, hasMore: result.hasMore },
      {
        status: 200,
        headers: {
          "Cache-Control": "private, no-store, must-revalidate",
          "X-Request-Id": requestId,
        },
      }
    );
  } catch (error) {
    if (error instanceof OrderDomainError) {
      const status = error.code === "UNAUTHENTICATED" ? 401 : error.code === "OUTLET_ACCESS_DENIED" ? 403 : 400;
      return NextResponse.json(
        { code: error.code, message: error.message, details: null, requestId },
        { status, headers: { "Cache-Control": "private, no-store, must-revalidate", "X-Request-Id": requestId } }
      );
    }
    return NextResponse.json(
      { code: "INTERNAL_ERROR", message: "Terjadi kesalahan. Silakan coba lagi.", details: null, requestId },
      { status: 500, headers: { "Cache-Control": "private, no-store, must-revalidate", "X-Request-Id": requestId } }
    );
  }
}

export const dynamic = "force-dynamic";