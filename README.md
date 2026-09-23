# WARUNGKU — Website UMKM Inovatif

> Blueprint implementasi lengkap untuk aplikasi UMKM kuliner berbasis **Next.js**, mencakup pemesanan QR, kasir/POS, reservasi dan uang muka, stok bahan baku, pembelian, dapur, serta laporan keuangan SAK EMKM.

![Next.js](https://img.shields.io/badge/Next.js-15-black)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791)
![PWA](https://img.shields.io/badge/PWA-Offline--ready-purple)
![License](https://img.shields.io/badge/license-Proprietary-lightgrey)

## 1. Ringkasan

Warungku adalah satu aplikasi web mobile/PWA untuk mengelola operasi UMKM F&B dari meja pelanggan hingga laporan keuangan:

- pelanggan memindai QR unik per meja, melihat menu, dan memesan tanpa memasang aplikasi;
- kasir mengelola tagihan, split bill, pembayaran, struk, serta buka/tutup shift;
- dapur menerima antrean pesanan secara real-time;
- reservasi memiliki kalender kapasitas dan uang muka yang dapat diatur admin;
- stok berkurang otomatis berdasarkan resep setiap menu yang terjual;
- pembelian, penerimaan, waste, dan stock opname tercatat sebagai mutasi;
- transaksi membentuk jurnal debit-kredit dan laporan SAK EMKM;
- PWA kasir tetap dapat membuat transaksi tunai ketika internet terputus.

### Sasaran MVP

| KPI | Target |
|---|---:|
| Waktu membuat pesanan | < 2 menit |
| Kesalahan item | < 1% order |
| No-show reservasi | < 8% |
| Selisih kas | Rp0 atau 100% terjelaskan |
| Food cost | 28–35% |
| Tutup buku bulanan | < 1 hari |
| Ketersediaan aplikasi | 99,9% |
| p95 API normal | < 300 ms |

## 2. Modul Utama

1. **Menu & QR Meja** — kategori, foto, varian, topping, alergi, sold-out otomatis, token QR.
2. **Pemesanan** — dine-in QR, walk-in POS, catatan item, status pesanan, kitchen ticket.
3. **Kasir/POS** — pajak, service, diskon, pembulatan, split bill, multi-payment, refund, shift.
4. **Kitchen Display System** — antrean per stasiun, timer, prioritas, status produksi.
5. **Reservasi** — slot, kapasitas, temporary hold, uang muka, reminder, check-in, no-show.
6. **Stok & Resep** — bahan, satuan, konversi, BOM/resep, minimum stock, mutasi, waste, opname.
7. **Pembelian** — supplier, purchase order, penerimaan parsial, retur, utang pemasok.
8. **Akuntansi** — chart of accounts, jurnal otomatis, buku besar, trial balance, lock period.
9. **Laporan** — penjualan, shift, stok, food cost, laba-rugi, posisi keuangan, arus kas.
10. **Admin & Audit** — user, role, approval, konfigurasi outlet, audit before/after, export.

## 3. Stack Teknologi

| Lapisan | Pilihan |
|---|---|
| Framework | **Next.js 15 App Router** |
| Bahasa | TypeScript 5, strict mode |
| UI | React 19, Tailwind CSS, shadcn/ui, Lucide Icons |
| Form | React Hook Form + Zod |
| Server state | TanStack Query |
| Database | PostgreSQL 16 terkelola |
| ORM | Prisma ORM |
| Authentication | Auth.js v5 + Credentials/PIN kasir; MFA admin opsional |
| Authorization | RBAC + scope `tenantId`/`outletId` di server |
| PWA | Serwist + Web App Manifest |
| Offline store | Dexie.js / IndexedDB |
| Realtime | Server-Sent Events atau managed WebSocket |
| Payment | Midtrans Snap/Core API QRIS; adapter untuk Xendit |
| Notifikasi | WhatsApp `wa.me`; WhatsApp Business API opsional |
| File | S3-compatible object storage |
| Job | Vercel Cron/Trigger.dev atau worker + tabel outbox |
| Printer | ESC/POS 58/80 mm via Web Bluetooth/local print bridge |
| Testing | Vitest, Testing Library, Playwright |
| Monitoring | Sentry + OpenTelemetry + structured logs |
| Deployment | Vercel + Neon/Supabase PostgreSQL; alternatif Docker/Railway |

> **Keputusan arsitektur:** gunakan modular monolith untuk MVP. Pisahkan domain secara tegas di kode, tetapi jangan menggunakan microservices sebelum kebutuhan skala dan tim benar-benar terukur.

## 4. Arsitektur

```mermaid
flowchart TD
  C[Customer PWA] --> CDN[CDN / WAF]
  P[Cashier PWA] --> CDN
  K[Kitchen Display] --> CDN
  A[Admin Web] --> CDN
  CDN --> N[Next.js 15 App Router]
  N --> IAM[Identity & RBAC]
  N --> CAT[Catalog]
  N --> ORD[Ordering]
  N --> BILL[Billing & Payment]
  N --> RSV[Reservation]
  N --> INV[Inventory & Procurement]
  N --> ACC[Accounting & Reporting]
  N --> OUT[Outbox & Notification]
  IAM --> DB[(PostgreSQL)]
  CAT --> DB
  ORD --> DB
  BILL --> DB
  RSV --> DB
  INV --> DB
  ACC --> DB
  N --> S3[Object Storage]
  BILL --> PG[Midtrans / Xendit]
  OUT --> WA[WhatsApp / Email]
```

### Prinsip Arsitektur

- API-first dan kontrak terversi melalui `/api/v1`.
- seluruh validasi harga, pajak, diskon, stok, dan hak akses dilakukan di server;
- transaksi uang dan stok bersifat idempoten serta dapat diaudit;
- gunakan database transaction untuk order, payment, stock movement, jurnal, dan outbox;
- simpan uang sebagai integer Rupiah, bukan floating point;
- simpan waktu dalam UTC dan tampilkan menggunakan `Asia/Jakarta`;
- dokumen finansial yang sudah diposting tidak dihapus—koreksi melalui reversal/refund.

## 5. Struktur Proyek

```text
warungku/
├── app/
│   ├── (public)/
│   │   ├── menu/[tableToken]/page.tsx
│   │   ├── order/[orderId]/page.tsx
│   │   └── reservasi/page.tsx
│   ├── (staff)/
│   │   ├── pos/page.tsx
│   │   ├── kitchen/page.tsx
│   │   ├── shifts/page.tsx
│   │   └── inventory/page.tsx
│   ├── (admin)/admin/
│   │   ├── dashboard/page.tsx
│   │   ├── catalog/page.tsx
│   │   ├── reservations/page.tsx
│   │   ├── procurement/page.tsx
│   │   ├── accounting/page.tsx
│   │   ├── reports/page.tsx
│   │   └── settings/page.tsx
│   ├── api/v1/
│   │   ├── public/menu/[tableToken]/route.ts
│   │   ├── public/orders/route.ts
│   │   ├── bills/[id]/payments/route.ts
│   │   ├── reservations/route.ts
│   │   ├── inventory/movements/route.ts
│   │   ├── reports/profit-loss/route.ts
│   │   └── webhooks/payments/[provider]/route.ts
│   ├── manifest.ts
│   ├── layout.tsx
│   └── globals.css
├── components/
│   ├── ui/
│   ├── menu/
│   ├── pos/
│   ├── kitchen/
│   ├── reservation/
│   ├── inventory/
│   └── reports/
├── modules/
│   ├── identity/
│   ├── catalog/
│   ├── ordering/
│   ├── billing/
│   ├── reservation/
│   ├── inventory/
│   ├── procurement/
│   ├── accounting/
│   ├── reporting/
│   └── notification/
├── lib/
│   ├── auth.ts
│   ├── db.ts
│   ├── money.ts
│   ├── permissions.ts
│   ├── idempotency.ts
│   ├── outbox.ts
│   ├── audit.ts
│   └── validators/
├── workers/
│   ├── outbox.worker.ts
│   ├── reservation-expiry.worker.ts
│   ├── reconciliation.worker.ts
│   └── daily-summary.worker.ts
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed.ts
├── public/
│   ├── icons/
│   └── offline.html
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
├── docs/
│   ├── adr/
│   ├── api/
│   └── runbooks/
├── middleware.ts
├── next.config.ts
├── package.json
└── README.md
```

## 6. Instalasi

### Prasyarat

- Node.js 24 LTS (disarankan v24.14.0 atau versi 24.x terbaru)
- pnpm 9+
- PostgreSQL 16
- akun payment gateway sandbox

```bash
pnpm create next-app@latest warungku \
  --typescript --tailwind --eslint --app --src-dir=false --import-alias="@/*"
cd warungku

pnpm add @prisma/client prisma zod next-auth@beta \
  @tanstack/react-query react-hook-form @hookform/resolvers \
  dexie serwist decimal.js date-fns nanoid pino

pnpm add -D vitest @vitest/coverage-v8 @testing-library/react \
  @playwright/test prettier prettier-plugin-tailwindcss

pnpm prisma generate
pnpm prisma migrate dev
pnpm dev
```

### Environment Variables

```dotenv
NODE_ENV=development
APP_URL=http://localhost:3000
APP_TIMEZONE=Asia/Jakarta
DATABASE_URL=postgresql://user:password@localhost:5432/warungku
AUTH_SECRET=change-with-strong-random-secret

OUTLET_TAX_PERCENT=10
OUTLET_SERVICE_PERCENT=0
OUTLET_ROUNDING=100
QR_TOKEN_TTL_MINUTES=180
OFFLINE_MAX_HOURS=24

RESERVATION_DEPOSIT_TTL_MINUTES=60
RESERVATION_NO_SHOW_MINUTES=30
PAYMENT_WEBHOOK_TOLERANCE_SECONDS=300

MIDTRANS_IS_PRODUCTION=false
MIDTRANS_SERVER_KEY=SB-Mid-server-xxx
MIDTRANS_CLIENT_KEY=SB-Mid-client-xxx
MIDTRANS_MERCHANT_ID=Gxxxx

WA_OWNER_NUMBER=628xxxxxxxxxx
S3_ENDPOINT=
S3_BUCKET=warungku
S3_ACCESS_KEY=
S3_SECRET_KEY=
SENTRY_DSN=
CRON_SECRET=
```

Jangan melakukan commit terhadap `.env`, key pembayaran, token webhook, atau credential database.

## 7. Model Domain dan Database

### Kelompok Entitas

| Domain | Entitas utama |
|---|---|
| IAM | `User`, `Role`, `Permission`, `UserOutlet`, `Session` |
| Outlet | `Tenant`, `Outlet`, `OutletSetting`, `DiningTable` |
| Katalog | `Category`, `Menu`, `MenuVariant`, `Modifier`, `MenuPrice` |
| Resep | `Ingredient`, `Unit`, `UnitConversion`, `Recipe`, `RecipeItem` |
| Order | `Order`, `OrderItem`, `OrderItemModifier`, `KitchenTicket` |
| Billing | `Bill`, `BillItem`, `Discount`, `Tax`, `Payment`, `Refund` |
| Shift | `CashShift`, `CashMovement`, `CashCount` |
| Reservasi | `Reservation`, `ReservationSlot`, `DepositRule`, `BookingDeposit` |
| Pembelian | `Supplier`, `PurchaseOrder`, `PurchaseOrderItem`, `GoodsReceipt` |
| Stok | `StockLocation`, `StockMovement`, `StockCount`, `WasteRecord` |
| Akuntansi | `Account`, `FiscalPeriod`, `JournalEntry`, `JournalLine`, `JournalMapping` |
| Platform | `OutboxMessage`, `WebhookEvent`, `Notification`, `ActivityLog` |

### ERD Inti

```mermaid
erDiagram
  OUTLET ||--o{ DINING_TABLE : has
  OUTLET ||--o{ ORDER : receives
  DINING_TABLE ||--o{ ORDER : owns
  CATEGORY ||--o{ MENU : groups
  MENU ||--o{ MENU_VARIANT : has
  MENU ||--o{ RECIPE : uses
  RECIPE ||--o{ RECIPE_ITEM : contains
  INGREDIENT ||--o{ RECIPE_ITEM : consumed
  ORDER ||--o{ ORDER_ITEM : contains
  ORDER ||--|| BILL : produces
  BILL ||--o{ PAYMENT : settled_by
  RESERVATION ||--o{ BOOKING_DEPOSIT : has
  SUPPLIER ||--o{ PURCHASE_ORDER : receives
  PURCHASE_ORDER ||--o{ GOODS_RECEIPT : fulfilled_by
  INGREDIENT ||--o{ STOCK_MOVEMENT : moves
  JOURNAL_ENTRY ||--o{ JOURNAL_LINE : contains
  ACCOUNT ||--o{ JOURNAL_LINE : posted_to
```

### Aturan Data

- gunakan UUID/ULID untuk ID publik;
- semua data bisnis memiliki `tenantId`, dan sebagian besar memiliki `outletId`;
- `providerTransactionId`, nomor dokumen, dan `idempotencyKey` harus unik;
- `StockMovement` bersifat append-only; jangan mengubah stok langsung pada master bahan;
- `JournalEntry` yang `POSTED` tidak boleh dihapus;
- simpan snapshot nama, SKU, harga, pajak, serta diskon pada baris transaksi;
- gunakan optimistic locking (`version`) pada order dan stok yang rawan konflik;
- indeks minimum: status+waktu, outlet+waktu, provider transaction, ingredient+waktu.

## 8. Status dan State Machine

```text
ORDER
BARU -> MENUNGGU_BAYAR -> DITERIMA -> DIMASAK -> SIAP
     -> DISAJIKAN -> DITAGIH -> LUNAS
Cabang: KEDALUWARSA, DIBATALKAN, REFUND_SEBAGIAN, REFUND_PENUH

RESERVATION
MENUNGGU_PEMBAYARAN -> TERKONFIRMASI -> HADIR -> SELESAI
Cabang: KEDALUWARSA, DIBATALKAN, TIDAK_HADIR

INGREDIENT AVAILABILITY
AMAN -> MENIPIS -> HABIS
```

Setiap perubahan status divalidasi melalui domain service. Jangan memperbarui status langsung dari client atau generic CRUD endpoint.

## 9. Aturan Bisnis

### Harga dan Tagihan

```ts
subtotalBaris = (hargaSnapshot + totalModifier) * quantity;
subtotal = sum(subtotalBaris);
diskon = hitungDiskon(subtotal, discountRules);
penjualanNet = subtotal - diskon;
serviceCharge = persen(penjualanNet, servicePercent);
dasarPajak = penjualanNet + serviceCharge;
pajak = persen(dasarPajak, taxPercent);
totalSebelumRounding = dasarPajak + pajak;
total = roundTo(totalSebelumRounding, 100);
sisaDibayar = total - depositApplied - pembayaranValid;
```

- hitung ulang seluruh harga di server;
- gunakan integer Rupiah atau `Decimal`, bukan `number` floating point untuk perhitungan persentase;
- urutan kalkulasi harus konsisten dan diuji dengan golden test;
- perubahan harga tidak mengubah transaksi historis;
- diskon di atas batas role membutuhkan approval;
- tagihan hanya `LUNAS` jika pembayaran valid memenuhi total;
- refund menghasilkan dokumen lawan dan jurnal reversal, bukan menghapus pembayaran.

### Uang Muka Reservasi

Admin dapat memilih salah satu mode:

| Mode | Rumus/contoh |
|---|---|
| Tanpa uang muka | Rp0 |
| Persentase | 20% dari minimum spend |
| Nominal tetap | Rp50.000 per reservasi |
| Per orang | Rp25.000 × jumlah tamu |
| Bayar penuh | Seluruh paket dibayar di awal |
| Minimum belanja | Uang muka menjamin minimum spend |

Kebijakan pembatalan bersifat configurable, misalnya 100% kembali pada H-2, 50% pada H-1, dan 0% pada hari H. Deposit dicatat sebagai **Pendapatan Diterima di Muka**, bukan pendapatan, sampai kunjungan atau no-show diselesaikan.

### Shift Kasir

```text
expectedCash = openingCash + cashSales + cashIn - cashRefund - cashOut
cashVariance = physicalCash - expectedCash
```

- satu user hanya boleh memiliki satu shift aktif per outlet;
- selisih tidak boleh disembunyikan atau mengubah transaksi sumber;
- variance harus memiliki alasan dan jurnal otomatis;
- reopen shift memerlukan otorisasi pemilik.

### Stok dan HPP

Gunakan **moving weighted average** untuk MVP:

```text
averageCostNew =
  (onHand × averageCostOld + receivedQty × receivedUnitCost)
  / (onHand + receivedQty)

recipeCost = Σ(recipeQtyBaseUnit × ingredientAverageCost)
foodCostPercent = recipeCost / netSellingPrice × 100%
```

Jenis mutasi minimum:

- `PURCHASE_RECEIPT`
- `SALE_DEDUCTION`
- `WASTE`
- `STOCK_TAKE_ADJUSTMENT`
- `PURCHASE_RETURN`
- `TRANSFER_IN`
- `TRANSFER_OUT`
- `MANUAL_ADJUSTMENT`

## 10. API Blueprint

### Konvensi

- base URL: `/api/v1`;
- format: JSON, ISO-8601 UTC, uang integer Rupiah;
- gunakan Zod untuk request/response schema;
- route publik menggunakan signed table token;
- route staf menggunakan session Auth.js dan pemeriksaan permission di server;
- `Idempotency-Key` wajib untuk membuat order, payment, refund, dan posting stok;
- error menggunakan `{ code, message, details, requestId }`;
- list menggunakan cursor pagination, maksimal 100 item.

### Endpoint Utama

| Method | Endpoint | Fungsi |
|---|---|---|
| `GET` | `/api/v1/public/menu/:tableToken` | Menu yang tersedia untuk meja |
| `POST` | `/api/v1/public/orders` | Membuat pesanan QR |
| `GET` | `/api/v1/orders/:id` | Status pesanan |
| `PATCH` | `/api/v1/orders/:id/status` | Transisi status tervalidasi |
| `POST` | `/api/v1/bills/:id/payments` | Memulai/mencatat pembayaran |
| `POST` | `/api/v1/bills/:id/split` | Membagi tagihan |
| `POST` | `/api/v1/payments/:id/refund` | Refund dengan approval |
| `POST` | `/api/v1/webhooks/payments/:provider` | Webhook payment gateway |
| `GET` | `/api/v1/reservations/availability` | Mencari slot |
| `POST` | `/api/v1/reservations` | Membuat temporary hold |
| `POST` | `/api/v1/reservations/:id/deposit` | Payment intent uang muka |
| `POST` | `/api/v1/shifts/open` | Membuka shift |
| `POST` | `/api/v1/shifts/:id/close` | Menutup shift |
| `GET/POST` | `/api/v1/inventory/movements` | Buku mutasi stok |
| `POST` | `/api/v1/stock-counts/:id/post` | Posting stock opname |
| `GET` | `/api/v1/reports/profit-loss` | Laporan laba-rugi |
| `GET` | `/api/v1/reports/stock` | Laporan stok |

### Contoh Membuat Pesanan

```http
POST /api/v1/public/orders
Content-Type: application/json
Idempotency-Key: 97e5f779-91ef-4cbe-b7cd-3fabf56cc239
```

```json
{
  "tableToken": "signed-token",
  "customerName": "Budi",
  "items": [
    {
      "menuId": "01J...",
      "variantId": "01J...",
      "quantity": 2,
      "modifierIds": ["01J..."],
      "note": "Gula sedikit"
    }
  ],
  "paymentMode": "PAY_AT_CASHIER"
}
```

### Prosedur Webhook Pembayaran

1. baca raw body dan header signature;
2. verifikasi HMAC/signature dan toleransi timestamp;
3. simpan `WebhookEvent` dengan unique `(provider, eventId)`;
4. cocokkan merchant, order ID, currency, dan amount;
5. lock bill/payment di database transaction;
6. jika event telah final, balas `200` tanpa efek ulang;
7. perbarui payment, bill, jurnal, dan outbox dalam satu transaksi;
8. worker mengirim struk; reconciliation job membandingkan settlement provider.

## 11. PWA dan Mode Offline

### Cache Strategy

| Data/aksi | Offline | Strategi |
|---|---|---|
| App shell | Ya | Cache-first, versioned |
| Menu & harga | Ya, read-only | Stale-while-revalidate |
| Order tunai POS | Ya | IndexedDB queue + client UUID |
| Status dapur | Terbatas | Queue + indikator belum sinkron |
| QRIS/payment online | Tidak | Tampilkan koneksi diperlukan |
| Konfigurasi admin | Tidak | Snapshot read-only |

### Bentuk Queue Lokal

```ts
type OfflineMutation = {
  id: string;
  outletId: string;
  userId: string;
  deviceId: string;
  kind: "CREATE_ORDER" | "UPDATE_KITCHEN_STATUS" | "CASH_PAYMENT";
  payload: unknown;
  idempotencyKey: string;
  createdAtClient: string;
  attempts: number;
  status: "PENDING" | "SYNCING" | "SYNCED" | "CONFLICT" | "FAILED";
};
```

### Resolusi Konflik

- transaksi append-only diterima jika idempotency key belum pernah diproses;
- server menjadi sumber kebenaran untuk menu, harga, pajak, dan permission;
- state transition menggunakan `version`; konflik masuk resolution queue;
- waktu perangkat tidak menjadi waktu posting—gunakan `serverReceivedAt`;
- transaksi offline maksimal 24 jam atau 500 mutation;
- tampilkan last sync, jumlah queue, dan tombol retry/export diagnostic.

## 12. Kitchen Display System

KDS menampilkan kartu pesanan berdasarkan stasiun (`BAR`, `KITCHEN`, `DESSERT`) dengan:

- nomor order, meja, waktu masuk, item, modifier, dan catatan;
- timer hijau/kuning/merah berdasarkan SLA menu;
- aksi `ACCEPT`, `START`, `READY`, dan `BUMP`;
- filter stasiun dan outlet;
- bunyi pesanan baru opsional;
- reconnect otomatis dan fallback polling;
- printer kitchen ticket sebagai fallback.

## 13. Akuntansi SAK EMKM

### Chart of Accounts Minimum

| Kode | Akun | Kelompok |
|---|---|---|
| 1110 | Kas | Aset |
| 1120 | Bank / QRIS clearing | Aset |
| 1130 | Persediaan bahan | Aset |
| 1210 | Peralatan | Aset |
| 2110 | Utang pemasok | Liabilitas |
| 2120 | Pendapatan diterima di muka | Liabilitas |
| 2130 | Utang pajak | Liabilitas |
| 3110 | Modal pemilik | Ekuitas |
| 4110 | Pendapatan penjualan | Pendapatan |
| 4130 | Diskon/retur | Kontra pendapatan |
| 5110 | Harga pokok penjualan | Beban |
| 5120 | Waste/selisih stok | Beban |
| 6110–6140 | Gaji, sewa, utilitas, pemasaran | Beban operasional |
| 6310 | Biaya QRIS | Beban |
| 6320 | Selisih kas | Beban/pendapatan |

### Jurnal Otomatis

| Peristiwa | Debit | Kredit |
|---|---|---|
| Penjualan tunai | Kas | Pendapatan + Utang pajak |
| Penjualan QRIS | QRIS clearing + biaya provider | Pendapatan + Utang pajak |
| Settlement QRIS | Bank | QRIS clearing |
| Deposit reservasi | Bank/QRIS | Pendapatan diterima di muka |
| Deposit digunakan | Pendapatan diterima di muka | Piutang/tagihan |
| Pembelian bahan | Persediaan | Kas/Utang pemasok |
| Pemakaian bahan | HPP | Persediaan |
| Waste/opname minus | Beban waste | Persediaan |
| Refund | Retur + utang pajak | Kas/Bank |
| Selisih kas minus | Beban selisih kas | Kas |

Setiap `JournalEntry` wajib memiliki minimal dua baris dan total debit sama dengan total kredit sebelum status menjadi `POSTED`.

### Laporan

- penjualan per outlet, channel, jam, kasir, kategori, dan menu;
- menu engineering: popularitas vs contribution margin;
- shift dan selisih kas;
- nilai stok, mutasi, waste, dan slow-moving;
- HPP serta food cost aktual vs standar;
- buku besar dan trial balance;
- laba-rugi;
- laporan posisi keuangan;
- arus kas;
- audit trail dan rekonsiliasi pembayaran.

## 14. Keamanan dan Privasi

### Kontrol Wajib

- TLS 1.2+, secure cookie, CSRF protection, CSP, dan security headers;
- Auth.js session dengan rotasi; PIN kasir hanya pada perangkat/outlet terdaftar;
- RBAC dan scope tenant/outlet diperiksa di server pada setiap query;
- password Argon2/bcrypt; MFA admin disarankan;
- validation, output escaping, parameterized query, rate limit;
- signed token QR meja dengan expiry dan kemampuan revoke;
- HMAC/signed webhook, anti-replay, idempotency, dan amount verification;
- immutable audit log untuk diskon, void, refund, harga, stok, dan konfigurasi;
- enkripsi backup serta object storage;
- mask nomor telepon dan secret pada log;
- data pelanggan dikumpulkan seminimal mungkin;
- consent transaksi dan consent pemasaran dipisahkan.

### Backup dan Disaster Recovery

| Objek | Frekuensi | Retensi |
|---|---|---|
| PostgreSQL | PITR + snapshot harian | 14–30 hari; bulanan 12 bulan |
| Object storage | Versioning | 30–90 hari |
| Config/IaC | Setiap perubahan di Git | Permanen |
| Audit/export penting | Bulanan terenkripsi | Sesuai kebijakan |

Target awal: **RPO ≤ 5 menit** dan **RTO ≤ 1 jam**. Uji restore minimal satu kali setiap bulan.

## 15. Observabilitas

- structured JSON logs dengan `requestId`, `tenantId`, `outletId`, dan actor ID;
- jangan mencatat password, token, full payment payload, atau PII sensitif;
- metrik traffic, error rate, p50/p95/p99, DB connection, queue lag;
- business metrics: orders, GMV, payment success, sync backlog, unbalanced journal;
- Sentry untuk error tracing dan release tracking;
- alert jika 5xx >1% selama 5 menit, webhook failure meningkat, queue lag >2 menit, jurnal tidak seimbang, atau stok negatif.

## 16. Testing

### Test Pyramid

| Lapisan | Cakupan |
|---|---|
| Unit | pricing, tax, deposit, state machine, HPP, journal mapping |
| Integration | API, RBAC, database transaction, idempotency, outbox |
| Contract | Midtrans/Xendit dan notification adapter |
| E2E | QR order, payment, booking, shift, stok, laporan |
| Performance | menu read, checkout, webhook burst, laporan |
| Security | SAST, dependency scan, access control, DAST |
| Recovery | backup restore, retry worker, offline sync |

### Kasus Uji Minimum

- `T01` QR valid, kedaluwarsa, dan dicabut;
- `T02` harga server berbeda dari cache client;
- `T03` modifier, diskon, pajak, service, pembulatan;
- `T04` webhook sah, palsu, ganda, dan out-of-order;
- `T05` split bill dan multi-payment;
- `T06` void/refund dengan dan tanpa permission;
- `T07` buka/tutup shift dan selisih kas;
- `T08` reservasi bersamaan pada slot terakhir;
- `T09` deposit expiry dan refund bertingkat;
- `T10` KDS menolak transisi status tidak valid;
- `T11` resep mengurangi stok dengan unit conversion;
- `T12` penerimaan parsial memperbarui moving average;
- `T13` stock opname plus/minus dan approval;
- `T14` setiap jurnal seimbang;
- `T15` periode terkunci menolak posting;
- `T16` offline order tersinkron tanpa duplikat;
- `T17` konflik offline masuk resolution queue;
- `T18` user tidak dapat mengakses outlet lain;
- `T19` laporan sesuai filter dan jurnal sumber;
- `T20` backup dapat dipulihkan;
- `T21` 100 pengguna bersamaan memenuhi SLO;
- `T22` navigasi keyboard, kontras, dan label form;
- `T23` PII dan secret tidak muncul di log;
- `T24` timezone dan pergantian hari tidak menggandakan nomor dokumen.

### Exit Criteria

- tidak ada defect Critical/High terbuka;
- 100% alur pembayaran, stok, shift, serta jurnal lulus;
- security scan tidak memiliki temuan kritis;
- performance memenuhi SLO;
- restore dan rollback berhasil;
- UAT ditandatangani pemilik serta perwakilan outlet.

## 17. CI/CD dan Deployment

```text
commit
  -> lint + typecheck
  -> unit + integration test
  -> SAST + dependency scan
  -> build immutable artifact
  -> deploy preview/staging
  -> migration dry-run
  -> Playwright E2E
  -> approval
  -> backup
  -> production canary
  -> smoke test
  -> promote atau rollback
```

### Opsi Deployment Rekomendasi

**Serverless sederhana:**

- Next.js: Vercel;
- PostgreSQL: Neon/Supabase;
- Storage: Cloudflare R2/S3;
- Cron: Vercel Cron/Trigger.dev;
- monitoring: Sentry.

**Container:**

- Next.js standalone Docker image;
- Railway/Render/Fly.io/VPS;
- managed PostgreSQL;
- worker process terpisah;
- reverse proxy dan CDN.

### Database Migration

- migration harus backward-compatible;
- gunakan expand-and-contract untuk rename/drop kolom;
- jangan menghapus kolom pada rilis yang sama dengan perubahan aplikasi;
- lakukan backup dan dry-run pada staging;
- migration finansial harus memiliki integrity query dan rollback/forward-fix plan.

## 18. Scripts

```json
{
  "scripts": {
    "dev": "next dev --turbopack",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "test:e2e": "playwright test",
    "db:generate": "prisma generate",
    "db:migrate": "prisma migrate dev",
    "db:deploy": "prisma migrate deploy",
    "db:seed": "tsx prisma/seed.ts",
    "db:studio": "prisma studio"
  }
}
```

## 19. Roadmap Implementasi

| Minggu | Fokus | Output |
|---:|---|---|
| 1 | Discovery dan fondasi | backlog, wireframe, model data, ADR |
| 2 | Platform | Auth.js, RBAC, outlet, CI/CD, observability |
| 3 | Katalog dan QR | menu, harga, modifier, table token |
| 4 | Ordering dan KDS | cart, order, state machine, kitchen display |
| 5 | POS dan shift | bill, diskon, pajak, split, kas |
| 6 | Pembayaran | QRIS, webhook, receipt, reconciliation |
| 7 | Reservasi | availability, deposit rule, reminder |
| 8 | Inventory | bahan, resep, movement, purchase, opname |
| 9 | Akuntansi | CoA, mapping jurnal, laporan dasar |
| 10 | PWA offline | cache, queue, conflict resolution |
| 11 | Hardening | keamanan, performa, DR, dokumentasi |
| 12 | Pilot dan go-live | UAT, pelatihan, cutover, hypercare |

### Tim Minimum

- Product Owner/SME: 0,3–0,5 FTE;
- System Analyst: 0,5 FTE;
- UI/UX: 0,3 FTE;
- Full-stack Next.js developer: 2 FTE;
- QA: 0,5–1 FTE;
- DevOps/Security: 0,2–0,3 FTE;
- Akuntan advisor: ad hoc.

## 20. Urutan Vibe Coding

Jangan meminta AI membangun seluruh aplikasi dalam satu prompt. Gunakan urutan berikut dan lakukan commit setelah setiap fase lulus test.

### Prompt 1 — Fondasi

```text
Buat fondasi Next.js 15 App Router TypeScript strict untuk aplikasi Warungku.
Gunakan Tailwind, shadcn/ui, Prisma PostgreSQL, Auth.js v5, Zod, Vitest,
dan Playwright. Buat struktur modular berdasarkan domain. Tambahkan lint,
typecheck, test, env validation, error boundary, request ID, structured logger,
dan seed satu tenant/outlet. Jangan buat fitur bisnis dulu.
```

### Prompt 2 — Identity dan RBAC

```text
Implementasikan Auth.js Credentials, password hash, PIN kasir, role dan
permission, user-outlet scope, middleware route protection, dan server-side
authorization helper. Tambahkan audit untuk login gagal dan perubahan role.
Buat unit serta integration test termasuk akses lintas outlet yang harus ditolak.
```

### Prompt 3 — Katalog dan QR

```text
Implementasikan Category, Menu, MenuVariant, Modifier, Ingredient, Recipe,
dan DiningTable. Buat admin CRUD dengan Zod, upload gambar, QR signed token
yang bisa expired/revoke, serta halaman publik /menu/[tableToken]. Harga dan
ketersediaan harus dihitung server-side. Sertakan migration, seed, dan test.
```

### Prompt 4 — Ordering dan KDS

```text
Implementasikan Order aggregate dan state machine. Buat endpoint idempoten
POST /api/v1/public/orders, keranjang pelanggan, POS walk-in, dan KDS real-time.
Validasi ulang harga, modifier, status menu, dan token meja di transaction.
Simpan snapshot harga. Tambahkan optimistic version dan seluruh test transisi.
```

### Prompt 5 — Billing, Shift, dan Payment

```text
Implementasikan Bill, Payment, Refund, CashShift, pajak, service charge,
diskon berbatas role, pembulatan Rp100, split bill, multi-payment, dan tutup
shift. Buat adapter Midtrans sandbox dan webhook HMAC yang idempoten.
Payment, bill, jurnal, dan outbox harus commit dalam satu DB transaction.
```

### Prompt 6 — Reservasi

```text
Implementasikan availability berdasarkan kapasitas, durasi dan buffer.
Tambahkan temporary hold, expiry 60 menit, enam mode deposit, payment intent,
reminder H-1, check-in, no-show 30 menit, pembatalan/refund bertingkat,
dan liability accounting. Uji race condition pada slot terakhir.
```

### Prompt 7 — Inventory dan Pembelian

```text
Implementasikan unit conversion, recipe/BOM, StockMovement append-only,
minimum stock, supplier, purchase order, goods receipt parsial, return, waste,
dan stock count. Gunakan moving weighted average. Penjualan posted harus
menghasilkan sale deduction dan HPP. Jangan pernah mengubah stok langsung.
```

### Prompt 8 — Akuntansi dan Laporan

```text
Implementasikan Account, FiscalPeriod, JournalEntry, JournalLine, mapping
event-to-journal, posting, reversal, period lock, ledger, trial balance,
laba-rugi, posisi keuangan, dan arus kas. Setiap jurnal harus debit=kredit.
Semua angka laporan harus dapat drill-down sampai dokumen sumber.
```

### Prompt 9 — PWA Offline

```text
Tambahkan Serwist, manifest, install prompt, app shell cache, Dexie queue,
client UUID dan Idempotency-Key. Izinkan order tunai dan status dapur offline,
tetapi blok QRIS. Tambahkan indikator koneksi, last sync, retry, export
diagnostic, conflict queue, batas 24 jam/500 mutation, dan Playwright test.
```

### Prompt 10 — Production Hardening

```text
Tambahkan CSP, rate limit, PII masking, webhook anti-replay, Sentry,
OpenTelemetry, health/readiness route, backup runbook, payment reconciliation,
alerts, load test, accessibility test, dependency scan, Dockerfile,
dan CI/CD production dengan canary serta rollback.
```

### Aturan Saat Menggunakan AI Coding Agent

1. minta agent membaca README dan file terkait sebelum mengubah kode;
2. batasi satu domain atau satu acceptance criterion per tugas;
3. minta rencana dan daftar file sebelum implementasi besar;
4. wajibkan migration, validation, authorization, audit, dan test;
5. jangan menerima `any`, mock permanen, hard-coded secret, atau TODO pada jalur uang;
6. jalankan `lint`, `typecheck`, unit test, dan E2E sebelum commit;
7. review diff secara manual, terutama pembayaran, stok, jurnal, dan permission;
8. commit kecil dan gunakan conventional commits.

## 21. Definition of Done

Sebuah fitur dianggap selesai jika:

- acceptance criteria terpenuhi;
- UI memiliki loading, empty, error, success, dan disabled state;
- Zod validation berjalan pada boundary;
- authorization dan outlet scope diuji di server;
- aksi sensitif menghasilkan audit log;
- unit/integration/E2E yang relevan lulus;
- tidak ada critical lint, type, dependency, atau security error;
- migration backward-compatible;
- log, metrics, dan error handling tersedia;
- dokumentasi API/runbook diperbarui.

## 22. Checklist Go-Live

- [ ] Outlet, meja, jam buka, zona waktu, pajak, service, dan rounding benar.
- [ ] Menu, harga, modifier, alergi, resep, unit, dan stok awal disetujui.
- [ ] QR meja diuji pada perangkat nyata dan token dapat dicabut.
- [ ] Role, permission, PIN, serta scope outlet diuji.
- [ ] Midtrans production key, signature, callback, settlement, dan refund diuji.
- [ ] Printer 58 mm dan Kitchen Display diuji pada jaringan outlet.
- [ ] Mode offline, reconnect, conflict, dan clock skew diuji.
- [ ] CoA, opening balance, mapping jurnal, serta laporan divalidasi akuntan.
- [ ] Backup, restore, rollback, alert, dan kontak eskalasi siap.
- [ ] Pelatihan satu shift penuh dan UAT selesai.
- [ ] Masa hypercare serta jalur dukungan telah diumumkan.

## 23. Risiko Utama

| Risiko | Mitigasi |
|---|---|
| Pegawai sulit beradaptasi | Libatkan sejak awal, training mode, champion outlet |
| Internet mati | Offline queue, hotspot cadangan |
| Webhook ganda/terlambat | Unique event, idempotency, reconciliation |
| Resep tidak akurat | Penimbangan, kalibrasi, opname mingguan |
| Kebocoran diskon/void | Limit role, approval, immutable audit |
| No-show reservasi | Deposit, reminder, grace period |
| Data hilang | PITR, offsite backup, restore drill |
| Laporan salah | Balanced journal, reconciliation, period lock |
| PII bocor | Minimalisasi, masking, RBAC, incident response |
| Scope creep | MVP gate, backlog, change control |

## 24. Konvensi Nomor Dokumen

| Objek | Contoh |
|---|---|
| Order | `OUT-T01-20260923-0042` |
| Bill | `BILL-T01-20260923-0038` |
| Reservasi | `RSV-T01-20260923-0011` |
| Purchase Order | `PO-2026-000317` |
| Goods Receipt | `GRN-2026-000412` |
| Jurnal | `JV-2026-000128` |
| SKU bahan | `BB-KOPI-ARABIKA-001` |

## 25. Lisensi dan Status

Blueprint ini merupakan baseline pengembangan. Sesuaikan pajak daerah, kebijakan refund, retensi data, chart of accounts, dan ketentuan pembayaran dengan lokasi serta badan usaha yang sebenarnya sebelum produksi.

---

**Rekomendasi awal:** bangun modular monolith Next.js, mulai dari satu outlet, gunakan payment sandbox sampai rekonsiliasi terbukti benar, lakukan pilot dua minggu, ukur KPI selama 90 hari, lalu aktifkan multi-outlet setelah proses operasional stabil.
