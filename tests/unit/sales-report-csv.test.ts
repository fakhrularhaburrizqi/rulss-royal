import { describe, expect, it } from "vitest";

import { buildSalesReportCsv } from "@/lib/dashboard/sales-report-csv";

const baseRow = {
  orderNumber: "ORD-001",
  createdAt: new Date("2026-11-08T07:30:00.000Z"),
  status: "COMPLETED",
  source: "CASHIER",
  customerName: 'Budi, "Pembeli"',
  tableCode: "M01",
  subtotal: 30000,
  taxAmount: 3000,
  serviceAmount: 0,
  total: 33000,
};

describe("lib/dashboard/sales-report-csv", () => {
  it("writes a UTF-8 BOM and the Indonesian header", () => {
    const csv = buildSalesReportCsv([]);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain(
      "No,Tanggal WIB,No. Pesanan,Status,Sumber,Meja,Pelanggan,Menu,Qty,Harga Satuan,Subtotal Item,Subtotal Pesanan,Pajak,Service,Total Pesanan"
    );
  });

  it("formats Jakarta time and maps status and source labels", () => {
    const csv = buildSalesReportCsv([
      {
        ...baseRow,
        items: [
          {
            menuNameSnapshot: "Nasi Goreng",
            quantity: 2,
            unitPrice: 15000,
            subtotal: 30000,
          },
        ],
      },
    ]);

    expect(csv).toContain("2026-11-08 14:30");
    expect(csv).toContain("Selesai");
    expect(csv).toContain("Kasir");
    expect(csv).toContain("Nasi Goreng,2,15000,30000,30000,3000,0,33000");
  });

  it("escapes commas and quotes", () => {
    const csv = buildSalesReportCsv([
      {
        ...baseRow,
        items: [
          {
            menuNameSnapshot: "Es Teh",
            quantity: 1,
            unitPrice: 5000,
            subtotal: 5000,
          },
        ],
      },
    ]);

    expect(csv).toContain('"Budi, ""Pembeli"""');
  });

  it("emits one placeholder item row for orders without items", () => {
    const csv = buildSalesReportCsv([{ ...baseRow, items: [] }]);
    expect(csv).toContain("ORD-001,Selesai,Kasir,M01");
    expect(csv).toContain(",,,,30000,3000,0,33000");
  });
});
