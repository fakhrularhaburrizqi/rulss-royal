export function getTableQrUrl(table: { code: string }): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/menu?table=${table.code}`;
}
