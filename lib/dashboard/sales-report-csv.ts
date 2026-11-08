import type { ReportExportRow } from "@/lib/dashboard/sales-report";

const pad2 = (value: number): string => String(value).padStart(2, "0");

const STATUS_LABELS: Readonly<Record<string, string>> = {
  RECEIVED: "Diterima",
  PREPARING: "Diproses",
  READY: "Siap",
  COMPLETED: "Selesai",
  CANCELLED: "Dibatalkan",
};

const SOURCE_LABELS: Readonly<Record<string, string>> = {
  CASHIER: "Kasir",
  QR_TABLE: "QR Meja",
};

const HEADER = [
  "No",
  "Tanggal WIB",
  "No. Pesanan",
  "Status",
  "Sumber",
  "Meja",
  "Pelanggan",
  "Menu",
  "Qty",
  "Harga Satuan",
  "Subtotal Item",
  "Subtotal Pesanan",
  "Pajak",
  "Service",
  "Total Pesanan",
];

const dateTimeFormatter = new Intl.DateTimeFormat("id-ID", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: "Asia/Jakarta",
});

function formatJakartaDateTime(value: Date): string {
  const parts = dateTimeFormatter.formatToParts(value);
  const byType = new Map(parts.map((part) => [part.type, part.value]));
  const day = pad2(Number(byType.get("day")));
  const month = pad2(Number(byType.get("month")));
  const year = byType.get("year");
  const hour = pad2(Number(byType.get("hour")));
  const minute = pad2(Number(byType.get("minute")));
  return `${day}/${month}/${year} ${hour}:${minute}`;
}

function csvCell(value: string | number | null | undefined): string {
  const text = value === null || value === undefined ? "" : String(value);
  if (text === "") {
    return "";
  }
  if (/[",;\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function csvRow(cells: Array<string | number | null | undefined>): string {
  return cells.map(csvCell).join(";");
}

export function buildSalesReportCsv(rows: readonly ReportExportRow[]): string {
  const lines: string[] = [csvRow(HEADER)];
  let rowNumber = 1;

  for (const row of rows) {
    const orderCells = [
      rowNumber,
      formatJakartaDateTime(row.createdAt),
      row.orderNumber,
      STATUS_LABELS[row.status] ?? row.status,
      SOURCE_LABELS[row.source] ?? row.source,
      row.tableCode ?? "",
      row.customerName ?? "",
    ];
    const orderTotals = [row.subtotal, row.taxAmount, row.serviceAmount, row.total];

    if (row.items.length === 0) {
      lines.push(
        csvRow([...orderCells, "", "", "", "", ...orderTotals])
      );
    } else {
      for (const item of row.items) {
        lines.push(
          csvRow([
            ...orderCells,
            item.menuNameSnapshot,
            item.quantity,
            item.unitPrice,
            item.subtotal,
            ...orderTotals,
          ])
        );
      }
    }

    rowNumber += 1;
  }

  return `\uFEFF${lines.join("\r\n")}\r\n`;
}