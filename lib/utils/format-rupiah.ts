export function formatRupiah(value: number): string {
  return `Rp${Math.round(value).toLocaleString("id-ID")}`;
}

const compactRupiahFormatter = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  notation: "compact",
  maximumFractionDigits: 1,
});

export function formatRupiahCompact(value: number): string {
  return compactRupiahFormatter.format(value);
}
