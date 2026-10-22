export type ReceiptItem = {
  menuNameSnapshot: string;
  quantity: number;
  unitPrice?: number;
  priceSnapshot?: number;
  subtotal?: number;
  note?: string | null;
};

export type ReceiptOrder = {
  orderNumber: string;
  createdAt: string | Date;
  customerName?: string | null;
  note?: string | null;
  source: string;
  total: number;
  diningTable?: { code: string } | null;
  items: ReceiptItem[];
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatRupiah(value: number): string {
  return `Rp${Math.round(value).toLocaleString("id-ID")}`;
}

export function buildReceiptHtml(order: ReceiptOrder): string {
  const createdAt =
    order.createdAt instanceof Date ? order.createdAt : new Date(order.createdAt);
  const dateLabel = createdAt.toLocaleString("id-ID");
  const sourceLabel = order.diningTable
    ? `Meja ${order.diningTable.code}`
    : "Kasir / Takeaway";
  const customerLabel = order.customerName?.trim() || "-";

  const itemRows = order.items
    .map((item) => {
      const qty = Number(item.quantity) || 0;
      const unitPrice =
        Number(item.unitPrice ?? item.priceSnapshot ?? 0) || 0;
      const subtotal = Number(item.subtotal ?? unitPrice * qty) || 0;
      const noteHtml = item.note
        ? `<br/><span style="font-size: 10px; font-style: italic;">(${escapeHtml(item.note)})</span>`
        : "";
      return `
                <tr>
                  <td>${escapeHtml(item.menuNameSnapshot)}${noteHtml}</td>
                  <td style="text-align: center;">${qty}</td>
                  <td style="text-align: right;">${formatRupiah(subtotal)}</td>
                </tr>
              `;
    })
    .join("");

  return `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Struk Pesanan #${escapeHtml(order.orderNumber)}</title>
          <style>
            body {
              font-family: 'Courier New', Courier, monospace;
              font-size: 11px;
              color: #000;
              background: #fff;
              margin: 0 auto;
              padding: 8px;
              max-width: 280px;
              width: 100%;
            }
            @media print {
              @page {
                margin: 0;
                size: 80mm auto;
              }
              body {
                margin: 0 auto;
                padding: 4px;
                max-width: 72mm;
                width: 100%;
              }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>Rulss Royal</h1>
            <p>Sistem Manajemen Resto & Cafe</p>
          </div>
          <div class="info">
            <table>
              <tr>
                <td>No. Pesanan:</td>
                <td style="font-weight: bold; text-align: right;">${escapeHtml(order.orderNumber)}</td>
              </tr>
              <tr>
                <td>Tanggal:</td>
                <td style="text-align: right;">${escapeHtml(dateLabel)}</td>
              </tr>
              <tr>
                <td>Meja / Sumber:</td>
                <td style="text-align: right;">${escapeHtml(sourceLabel)} (${escapeHtml(order.source)})</td>
              </tr>
              <tr>
                <td>Pelanggan:</td>
                <td style="text-align: right;">${escapeHtml(customerLabel)}</td>
              </tr>
            </table>
          </div>
          <table class="items">
            <thead>
              <tr>
                <th>Item</th>
                <th style="text-align: center;">Qty</th>
                <th style="text-align: right;">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              ${itemRows}
            </tbody>
          </table>
          <div class="total-section">
            <div class="total-row">
              <span>TOTAL:</span>
              <span>${formatRupiah(order.total)}</span>
            </div>
          </div>
          <div class="footer">
            <p>Terima kasih atas kunjungan Anda!</p>
            <p>Silakan datang kembali</p>
          </div>
          <script>
            window.onload = function() {
              window.print();
              window.close();
            };
          </script>
        </body>
      </html>
    `;
}

export function openReceiptPrintWindow(order: ReceiptOrder): void {
  const printWindow = window.open("", "_blank");
  if (!printWindow) return;

  printWindow.document.write(buildReceiptHtml(order));
  printWindow.document.close();
}
