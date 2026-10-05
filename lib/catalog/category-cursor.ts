import { encodeCursor, decodeCursor, validateCursorBinding, type CursorPayload } from "@/lib/validators/category-query";

export { encodeCursor, decodeCursor, validateCursorBinding, type CursorPayload };

export function buildCursorFromItem(
  item: { sortOrder: number; name: string; id: string },
  context: { outletId: string; filter: "all" | "active" | "inactive" | "archived"; search: string | undefined }
): string {
  const payload: CursorPayload = {
    v: 1,
    sortOrder: item.sortOrder,
    name: item.name,
    id: item.id,
    outletId: context.outletId,
    filter: context.filter,
    search: context.search ?? undefined,
  };
  return encodeCursor(payload);
}