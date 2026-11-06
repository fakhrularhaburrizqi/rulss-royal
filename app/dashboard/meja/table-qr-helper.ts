export function getTableQrUrl(
  table: { id: string; code: string; qrToken?: string | null; outletId?: string },
  tokenOverride?: string | null
): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const activeToken = tokenOverride !== undefined ? tokenOverride : (table.qrToken ?? null);

  if (activeToken) {
    const outletParam = table.outletId ? `&outlet=${table.outletId}` : "";
    return `${origin}/p/${table.id}?token=${activeToken}${outletParam}`;
  }

  // Fallback if token is not yet generated
  const outletParam = table.outletId ? `?outlet=${table.outletId}` : "";
  return `${origin}/menu?table=${table.code}${outletParam}`;
}
