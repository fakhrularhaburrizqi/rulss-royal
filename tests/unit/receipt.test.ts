import { describe, expect, it } from "vitest";

import { buildReceiptHtml } from "@/lib/order/receipt";

describe("buildReceiptHtml", () => {
  const baseOrder = {
    orderNumber: "WRG-240101-0001",
    createdAt: "2024-01-01T10:00:00.000Z",
    customerName: "Budi",
    note: null,
    source: "CASHIER",
    total: 23000,
    diningTable: { code: "A1" },
    items: [
      {
        menuNameSnapshot: "Nasi Goreng",
        unitPrice: 18000,
        quantity: 1,
        subtotal: 18000,
        note: null,
      },
      {
        menuNameSnapshot: "Es Teh Manis",
        unitPrice: 5000,
        quantity: 1,
        subtotal: 5000,
        note: "sedikit gula",
      },
    ],
  };

  it("renders thermal receipt markup with order number and total", () => {
    const html = buildReceiptHtml(baseOrder);

    expect(html).toContain("WRG-240101-0001");
    expect(html).toContain("Nasi Goreng");
    expect(html).toContain("Es Teh Manis");
    expect(html).toContain("Rp23.000");
    expect(html).toContain("Meja A1");
    expect(html).toContain("Budi");
    expect(html).toContain("sedikit gula");
    expect(html).toContain("window.print()");
  });

  it("renders takeaway label when there is no dining table", () => {
    const html = buildReceiptHtml({ ...baseOrder, diningTable: null, customerName: null });

    expect(html).toContain("Kasir / Takeaway");
    expect(html).toContain("<td style=\"text-align: right;\">-</td>");
  });

  it("escapes html in customer-provided text", () => {
    const html = buildReceiptHtml({
      ...baseOrder,
      customerName: '<script>alert("x")</script>',
      items: [
        {
          menuNameSnapshot: "<img src=x onerror=alert(1)>",
          unitPrice: 1000,
          quantity: 1,
          subtotal: 1000,
          note: null,
        },
      ],
    });

    expect(html).not.toContain("<script>alert");
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&lt;img src=x");
  });

  it("falls back to unitPrice * quantity when subtotal missing", () => {
    const html = buildReceiptHtml({
      ...baseOrder,
      total: 9000,
      items: [
        {
          menuNameSnapshot: "Mie Ayam",
          unitPrice: 15000,
          quantity: 0,
          note: null,
        },
      ],
    });

    expect(html).toContain("Mie Ayam");
  });
});
