import { NextRequest, NextResponse } from "next/server";

import {
  OrderDomainError,
  getOrderErrorMessage,
  type OrderErrorCode,
} from "@/lib/order/errors";
import { listMenuItemsPaginated } from "@/lib/services/menu-item-query.service";
import { menuItemListQuerySchema } from "@/lib/validators/menu-item-query";

const QUERY_KEYS = ["outletId", "limit", "filter", "search", "cursor"] as const;
const ALLOWED_KEYS: ReadonlySet<string> = new Set<string>(QUERY_KEYS);
const CACHE_CONTROL = "private, no-store, must-revalidate";

function errorResponse(
  status: number,
  code: OrderErrorCode,
  message: string,
  details: Record<string, string[]> | null,
  requestId: string
): NextResponse {
  return NextResponse.json(
    { code, message, details, requestId },
    {
      status,
      headers: {
        "Cache-Control": CACHE_CONTROL,
        "X-Request-Id": requestId,
      },
    }
  );
}

function statusForErrorCode(code: OrderErrorCode): number {
  switch (code) {
    case "UNAUTHENTICATED":
      return 401;
    case "OUTLET_ACCESS_DENIED":
      return 403;
    case "INTERNAL_ERROR":
      return 500;
    default:
      return 400;
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const requestId = crypto.randomUUID();
  const { searchParams } = new URL(request.url);

  for (const key of QUERY_KEYS) {
    if (searchParams.getAll(key).length > 1) {
      return errorResponse(400, "INVALID_INPUT", `Parameter duplikat: ${key}`, null, requestId);
    }
  }

  for (const key of new Set(searchParams.keys())) {
    if (!ALLOWED_KEYS.has(key)) {
      return errorResponse(400, "INVALID_INPUT", `Parameter tidak dikenal: ${key}`, null, requestId);
    }
  }

  const rawInput = {
    outletId: searchParams.get("outletId") ?? undefined,
    limit: searchParams.get("limit") ?? undefined,
    filter: searchParams.get("filter") ?? undefined,
    search: searchParams.get("search") ?? undefined,
    cursor: searchParams.get("cursor") ?? undefined,
  };

  const parsedResult = menuItemListQuerySchema.safeParse(rawInput);
  if (!parsedResult.success) {
    const details = parsedResult.error.flatten().fieldErrors;
    return errorResponse(400, "INVALID_INPUT", "Parameter tidak valid", details, requestId);
  }

  try {
    const result = await listMenuItemsPaginated(parsedResult.data);

    return NextResponse.json(
      { data: result.data, nextCursor: result.nextCursor, hasMore: result.hasMore },
      {
        status: 200,
        headers: {
          "Cache-Control": CACHE_CONTROL,
          "X-Request-Id": requestId,
        },
      }
    );
  } catch (error) {
    if (error instanceof OrderDomainError) {
      const message =
        error.code === "INTERNAL_ERROR"
          ? getOrderErrorMessage("INTERNAL_ERROR")
          : error.message;
      return errorResponse(statusForErrorCode(error.code), error.code, message, null, requestId);
    }
    return errorResponse(500, "INTERNAL_ERROR", getOrderErrorMessage("INTERNAL_ERROR"), null, requestId);
  }
}

export const dynamic = "force-dynamic";
