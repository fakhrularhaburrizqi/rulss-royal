# Warungku

**Aplikasi pemesanan menu melalui QR meja dan dashboard pengelola untuk UMKM kuliner.**

Warungku memungkinkan pelanggan memindai QR meja, melihat menu, memilih item, dan mengirim pesanan tanpa membuat akun. Pengelola mengatur katalog dan meja, menerima pesanan, serta memperbarui status melalui dashboard dengan autentikasi dan pembatasan akses tenant/outlet.

Rilis awal ditujukan untuk demonstrasi UAS dan deployment terbatas menggunakan data uji. **Alur QR sampai pesanan diterima pengelola adalah fitur inti rilis awal**, bukan hanya roadmap. Modul finansial dan operasional yang lebih kompleks dilanjutkan setelah alur utama tersebut berjalan.

> Dokumen ini membedakan fitur yang tersedia dari target rilis. QR-order, antarmuka Menu/Meja, penerimaan pesanan, dan deployment belum diklaim selesai hanya karena fondasi backend atau demo sudah tersedia.

## 1. Tujuan dan Alur Utama

Alur pelanggan:

**Scan QR meja → lihat menu outlet → pilih item → keranjang → kirim pesanan → lihat konfirmasi dan status.**

Alur pengelola:

**Login → pilih outlet → kelola kategori/menu/meja → lihat pesanan masuk → perbarui status pesanan.**

Tujuan rilis awal:

- Memperlihatkan pemesanan QR yang benar-benar tersimpan di database.
- Memastikan meja dan outlet ditentukan dari token yang diverifikasi server.
- Memastikan harga dan ketersediaan dihitung ulang di server.
- Mencegah pesanan ganda akibat klik ulang atau retry request.
- Memisahkan data usaha/outlet dan membatasi akses pengelola berdasarkan permission.
- Menyediakan aplikasi yang dapat dideploy dan didemonstrasikan melalui perangkat pelanggan serta pengelola.

## 2. Cakupan Wajib Rilis Awal

### A. Autentikasi dan dashboard

- Login pengelola dengan mekanisme tenant/email/password yang tersedia.
- Proteksi dashboard dan logout.
- Identitas tenant, pemilihan outlet, dan pemeriksaan akses outlet.
- Permission membaca dan mengelola katalog serta pesanan di server.
- Navigasi dan tampilan desktop/mobile yang terbaca.

### B. Pengelolaan katalog

- Kategori: list, search, filter, pagination, tambah, edit, arsip, pulihkan.
- Menu: list management, search/filter/pagination, tambah dan edit data dasar.
- Data dasar Menu: kategori, nama, deskripsi bila digunakan, harga integer Rupiah, status aktif, dan sold-out manual.
- Menu yang tidak aktif, diarsipkan, sold-out, atau berkategori tidak tersedia tidak dapat dipesan melalui halaman publik.
- Pengelolaan gambar pada rilis awal boleh menggunakan URL metadata existing; upload file/object storage tidak menjadi blocker.
- Validasi, optimistic concurrency, audit, serta feedback mutation sesuai kontrak backend.

Archive/restore Menu dapat dilanjutkan sebagai peningkatan terpisah apabila tidak diperlukan untuk menyelesaikan alur demo; pengelola tetap harus dapat mengontrol item yang ditampilkan dan bisa dipesan melalui status yang didukung.

### C. Meja dan QR

- List, tambah/edit data dasar, dan aktif/nonaktif meja sesuai backend existing.
- QR untuk setiap meja yang dikelola dalam outlet.
- Signed token atau mekanisme token terverifikasi yang mengikat identitas meja/outlet.
- Expiry dan revoke/invalidation token yang dapat diuji.
- Token invalid, expired, revoked, atau meja tidak aktif tidak dapat digunakan membuat pesanan.
- QR dapat ditampilkan/diunduh atau dicetak melalui browser untuk demonstrasi; printer ESC/POS tidak diwajibkan.
- Jangan menggunakan query `tableId`/`outletId` yang dipercaya begitu saja sebagai pengganti keamanan token.

### D. Menu publik dan keranjang

- Pelanggan tidak diwajibkan login pengelola atau membuat akun.
- Halaman menu menggunakan data database dari outlet yang diizinkan token.
- Identitas meja ditampilkan agar pelanggan mengetahui tujuan pesanan.
- Item tersedia, harga, quantity, catatan, serta ringkasan pesanan dapat dilihat.
- Keranjang boleh menggunakan state lokal, tetapi pengiriman pesanan dan sumber harga/ketersediaan harus divalidasi server.
- Halaman memiliki loading, empty, unavailable-token, validation/error, dan success states.

### E. Pembuatan pesanan

- Pesanan tersimpan di PostgreSQL, bukan hanya `localStorage`.
- Outlet/meja ditentukan dari token/context yang diverifikasi server.
- Harga item dan jumlah total dihitung ulang di server; total client bukan sumber kebenaran.
- Nama/harga dan informasi transaksi yang diperlukan disimpan sebagai snapshot.
- Quantity, catatan, batas item, dan availability divalidasi sesuai domain existing.
- Pembuatan order atomik dalam database transaction.
- Idempotency key dan penanganan request duplikat yang benar; disable tombol atau retry nomor order saja bukan idempotency.
- Setelah berhasil, pelanggan menerima nomor/konfirmasi pesanan.
- Informasi pembayaran pada rilis awal adalah **bayar di kasir**. Ini bukan fitur pencatatan pembayaran, bukti lunas, atau integrasi payment gateway.

### F. Penerimaan dan status pesanan

- Dashboard pengelola menampilkan pesanan masuk dari database, dengan meja, waktu, item, quantity, catatan, dan total dasar.
- Pengelola dapat menjalankan transisi status dasar yang didukung domain service.
- Alur minimum mencakup menerima/memproses pesanan serta menandai siap/selesai; pemetaan label UI harus mengikuti kontrak state machine backend yang ditinjau, bukan menulis status arbitrer dari client.
- Pembatalan mengikuti transisi dan permission yang tersedia; tidak hard-delete transaksi.
- Pelanggan dapat melihat status pesanan miliknya dengan kontrol akses yang aman.
- Mengetahui order ID saja tidak boleh menjadi izin membaca semua pesanan atau data pelanggan lain.
- Pembaruan daftar/status boleh menggunakan polling atau refresh yang jelas. SSE/WebSocket dan KDS multi-stasiun bukan syarat rilis awal.
- Order read/update dibatasi tenant/outlet dan permission pengelola.

### G. Deployment dan pengujian

- Aplikasi tersedia melalui URL HTTPS pada hosting yang dipilih.
- Database deployment dan environment disiapkan secara terkontrol.
- Akun/dataset demo tidak memuat secrets atau data pelanggan nyata.
- Alur QR → order → dashboard → status diuji pada deployment, bukan hanya localhost.
- Setup, pengujian, serta langkah pemulihan dasar terdokumentasi.

## 3. Implementasi yang Tersedia

Bagian ini berdasarkan checkpoint implementasi yang telah diverifikasi dan dilaporkan. Tidak menyatakan seluruh target pada bagian 2 sudah selesai.

| Area | Implementasi tersedia | Batasnya |
|---|---|---|
| Fondasi | Next.js, TypeScript strict, Prisma/PostgreSQL, Auth.js | Deployment dan konfigurasi production tetap perlu diuji |
| Identity/outlet | Login dasar, RBAC helpers, tenant/outlet context, dashboard shell dan selector | Administration UI/PIN/approval lengkap bukan fitur selesai |
| Kategori | List/search/filter/pagination, tambah/edit/arsip/pulihkan, conflict handling, audit backend, focus dan refresh feedback | Mutation nyata pada deployment serta E2E masih diperlukan |
| API katalog | Management list kategori dan Menu, cursor pagination, scoped authorization, browser API clients | API management membutuhkan session; bukan API menu publik anonim |
| Menu | Backend mutation/read dan bounded management API | UI management Menu belum dinyatakan selesai |
| Meja | Backend validasi/read/mutation dasar | UI meja dan alur signed QR belum dinyatakan selesai |
| Order | Domain create/status dasar, snapshot dan transaction handling pada jalur existing | Endpoint publik idempoten, QR context, tracking, dan UI penerimaan belum dinyatakan selesai |
| Demo | Landing/menu/cart/checkout/operasional demonstrasi | State lokal/localStorage bukan alur order produksi |

Dengan demikian, fondasi existing digunakan kembali, tetapi fitur publik tidak boleh dianggap selesai hanya karena backend staff atau demo telah tersedia.

## 4. Fitur di Luar Syarat Rilis Awal

Berikut bukan blocker UAS, dan tidak diklaim sebagai fitur produksi tersedia:

- Payment gateway/QRIS, webhook settlement, split bill, multi-payment, refund finansial, dan shift kasir lengkap.
- Pajak, service, discount approval, dan billing kompleks. Total dasar rilis awal mengikuti kontrak pricing yang tersedia dan dijelaskan secara jujur.
- KDS multi-stasiun/realtime, SLA kitchen timer, dan printer ESC/POS.
- Reservasi dan deposit.
- Inventory, resep, auto sold-out berbasis bahan, pembelian, serta HPP.
- Akuntansi SAK EMKM dan laporan keuangan.
- PWA offline/queue/conflict sync.
- Varian, modifier/topping, alergi, dan upload gambar/storage.
- Administrasi pengguna/role, PIN perangkat, dan approval operasional lengkap.

Fitur tersebut tetap dapat dikembangkan sesudah rilis awal. Scope dikurangi dengan menunda kompleksitas operasional, **bukan menghilangkan pemesanan QR**.

## 5. Teknologi

| Lapisan | Teknologi |
|---|---|
| Framework | Next.js 15 App Router |
| UI | React 19, Tailwind CSS, komponen berbasis Radix/shadcn-style, Lucide |
| Bahasa | TypeScript strict |
| Database/ORM | PostgreSQL 16, Prisma 6 |
| Auth pengelola | Auth.js v5 Credentials |
| Form/validasi | React Hook Form, Zod |
| Server state | TanStack Query |
| Tests | Vitest, Testing Library; browser/integration/E2E sesuai fase |
| Tooling | pnpm, ESLint, Prettier |

Node.js 24 LTS digunakan pada lingkungan pengembangan. Ikuti versi yang dikunci `package.json` dan `pnpm-lock.yaml`; jangan memperbarui seluruh dependency hanya untuk mengikuti contoh dokumentasi.

## 6. Prinsip Arsitektur dan Keamanan

- Modular monolith; domain dipisahkan tanpa mewajibkan microservices.
- Management routes menggunakan session dan permission server.
- Public QR routes menggunakan token/context publik yang diverifikasi; jangan menghapus authorization staff agar endpoint dapat dipakai anonim.
- Token tidak boleh memungkinkan akses lintas tenant/outlet.
- Public menu hanya menampilkan data yang dibutuhkan pelanggan, bukan audit atau informasi internal management.
- Harga, availability, quantity, dan transisi status diverifikasi server.
- Uang integer Rupiah; waktu UTC dengan tampilan Asia/Jakarta bila diperlukan.
- Order dibuat atomik; idempotency key diproses sesuai kontrak request, bukan sekadar dicegah oleh UI.
- Request yang memakai key sama dengan payload berbeda ditangani eksplisit sesuai kontrak idempotency.
- Domain order existing boleh digunakan ulang setelah context publik dan permission boundary ditinjau.
- Pengelola menggunakan trusted tenant/outlet context; UI permission bukan satu-satunya kontrol.
- Cache client dipisahkan menurut scope dan parameter query.
- Akses status pelanggan menggunakan capability/session/token sesuai desain yang ditinjau; URL order ID saja tidak cukup.
- Signed QR/access tokens adalah kredensial: jangan ditulis ke log, di-commit, atau diekspos sebagai contoh aktif dalam README.
- Rate-limit pada endpoint publik dan masking log harus dipertimbangkan sebagai bagian deployment alur QR.

## 7. Struktur Utama Repository

```text
app/
  (auth)/                 # Autentikasi pengelola
  api/                    # Auth dan endpoint katalog existing
  dashboard/
    components/           # Shell, navigasi, pemilihan outlet
    kategori/             # UI kategori existing
components/
  ui/                     # Primitif UI
lib/
  api/                    # API clients
  dashboard/              # Context/query-key factories
  order/                  # Context/errors/domain helpers
  services/               # Domain/read/query services
  validators/             # Request schemas
prisma/
  schema.prisma
  migrations/
scripts/                  # Bootstrap existing
tests/
  unit/                   # Unit dan DOM tests
```

Path untuk Menu UI, meja/QR, public ordering, tracking, dan staff orders ditetapkan pada rencana implementasi berikutnya. Struktur di atas adalah ringkasan area existing, bukan klaim seluruh folder fitur target sudah dibuat.

## 8. Kontrak API

### Endpoint tersedia

| Method | Endpoint | Fungsi |
|---|---|---|
| GET | `/api/v1/catalog/categories` | List kategori management |
| GET | `/api/v1/catalog/menu-items` | List Menu management |

Keduanya memerlukan session/permission yang sesuai. List management dapat mengandung item arsip/tidak tersedia, sehingga **tidak boleh ditampilkan langsung sebagai menu publik tanpa kontrak publik tersendiri**.

Kontrak list:

```json
{
  "data": [],
  "nextCursor": null,
  "hasMore": false
}
```

Menu management menggunakan `outletId`, `limit` default 50/max 100, filter item, search maksimal 120, dan opaque cursor. Kategori mengikuti kontraknya sendiri, termasuk search maksimal 80.

### Target endpoint rilis QR-order

Endpoint berikut adalah target, **belum diklaim tersedia**:

| Method | Target | Fungsi |
|---|---|---|
| GET | `/api/v1/public/menu/:tableToken` | Menu publik berdasarkan token meja |
| POST | `/api/v1/public/orders` | Membuat order dengan idempotency key |
| GET | `/api/v1/orders/:id` atau public tracking route yang disepakati | Status dengan access policy pelanggan/pengelola yang eksplisit |
| GET | Staff order list route yang disepakati | Pesanan pada trusted outlet pengelola |
| PATCH/action | Staff order status boundary yang disepakati | Transisi melalui domain service |

Final path dan bentuk DTO ditinjau terhadap repository sebelum BUILD. Error menggunakan `code`, `message`, `details`, `requestId` sesuai kontrak. Jangan menambahkan endpoint generik yang mengizinkan update status/data tanpa validation dan authorization.

## 9. Menjalankan Lokal

### Prasyarat

- Node.js 24 LTS dan pnpm sesuai repository.
- PostgreSQL 16 yang dapat diakses.
- Environment dan akun pengelola yang valid.

### Langkah

```powershell
pnpm install --frozen-lockfile
pnpm exec prisma generate
```

Siapkan environment mengikuti contoh/validator repository. Pada database baru yang memang disiapkan untuk aplikasi, terapkan migration existing secara terkontrol:

```powershell
pnpm exec prisma migrate deploy
pnpm dev
```

Buka `http://localhost:3000`, login, dan buka dashboard.

Bootstrap tenant/outlet/admin mengikuti script actual repository. Periksa parameter terlebih dahulu. Jangan mengulang bootstrap pada database berisi akun hanya untuk memperbaiki login.

> Jangan menggunakan `db push`, `migrate reset`, atau seed ulang sebagai recovery umum. Migration, bootstrap, dan mutation nyata harus menggunakan target database yang diketahui dan persetujuan yang jelas.

## 10. Environment dan Secrets

Contoh placeholder minimum, bukan kredensial siap pakai:

```dotenv
DATABASE_URL=postgresql://APP_USER:APP_PASSWORD@DB_HOST:5432/warungku
AUTH_SECRET=REPLACE_WITH_A_STRONG_RANDOM_SECRET
```

- Nama environment tambahan mengikuti configuration actual, bukan dianggap tersedia karena disebut README.
- Domain/origin Auth.js disesuaikan dengan hosting HTTPS.
- QR signing/access-token secrets menggunakan mekanisme konfigurasi yang ditinjau saat implementasi; tidak boleh hardcoded.
- Deployment menggunakan secrets terpisah dari development.
- Jangan commit `.env`, database credentials, session cookies, password, atau token aktif.
- Secrets tidak boleh diberi prefix `NEXT_PUBLIC_`.
- Payment gateway/S3 secrets tidak diperlukan untuk sekadar menyelesaikan alur QR-order tanpa pembayaran online/upload.

## 11. Pengujian

Verification dasar:

```powershell
pnpm run typecheck
pnpm run lint
pnpm test
pnpm run test:coverage
pnpm run build
```

Tests existing mencakup domain dasar, kategori, scoped-query/cursor, serta management API/client. Unit/DOM tests dengan mocks tidak disamakan dengan seluruh integration database atau E2E.

### Acceptance tests wajib QR-order

- [ ] Token valid membuka meja/outlet yang benar.
- [ ] Token invalid/expired/revoked dan meja inactive ditolak.
- [ ] Menu inactive/archived/sold-out atau berkategori unavailable tidak dapat dipesan.
- [ ] Harga client yang dimanipulasi tidak menjadi harga order.
- [ ] Quantity/catatan/request invalid ditolak.
- [ ] Order dan items tersimpan atomik dengan snapshot.
- [ ] Klik ulang/retry dengan idempotency key sama tidak menghasilkan dua order.
- [ ] Key sama dengan payload berbeda tidak diterima sebagai transaksi baru secara diam-diam.
- [ ] Request publik tidak bisa menyisipkan tenant/outlet/meja lain.
- [ ] Staff list/status dibatasi permission dan scope server.
- [ ] Transisi invalid/stale version ditolak tanpa overwrite otomatis.
- [ ] Pelanggan tidak bisa membaca order pelanggan lain hanya dengan mengganti ID.
- [ ] Status pelanggan sesuai perubahan oleh pengelola.
- [ ] Mobile/keyboard/loading/error/retry bekerja pada jaringan perangkat nyata.
- [ ] Alur end-to-end diuji pada database dan deployment tujuan.

Data uji digunakan dengan persetujuan; jangan melakukan pengujian mutation pada data usaha nyata tanpa rencana.

## 12. Deployment Rilis Awal

Pilih satu jalur hosting Next.js dan PostgreSQL yang kompatibel, misalnya Vercel + Neon/Supabase atau hosting Node.js lain. Deployment belum dianggap selesai hanya karena `pnpm build` lokal berhasil.

### Persiapan

- [ ] Branch/commit deployment ditentukan.
- [ ] Database tujuan terpisah dari development dan berisi dataset demo yang disetujui.
- [ ] Environment/auth/QR secrets production diatur melalui secret manager.
- [ ] Origin/URL aplikasi sesuai domain HTTPS.
- [ ] Install lockfile dan Prisma generate bekerja pada build hosting.
- [ ] Migration dijalankan sebagai release operation yang terkontrol, bukan per-request.
- [ ] Akun demo disiapkan tanpa password ditulis publik.
- [ ] QR/token demo dihasilkan untuk meja database deployment, bukan meja development.
- [ ] Typecheck/lint/tests/build lulus.
- [ ] Backup dan recovery dasar tersedia sebelum mutation testing.
- [ ] Error/secret masking dan pembatasan endpoint publik diperiksa.

### Smoke test deployment

- [ ] Login/logout dan dashboard protection bekerja.
- [ ] Kategori/Menu/Meja sesuai outlet dan permission.
- [ ] Scan QR dari HP membuka menu deployment dan meja yang benar.
- [ ] Pelanggan dapat mengirim order dan menerima konfirmasi.
- [ ] Order terlihat pada dashboard pengelola.
- [ ] Perubahan status pengelola terlihat pada pelanggan.
- [ ] Retry/klik ulang tidak membuat order ganda.
- [ ] Token invalid/revoked dan akses order tidak berizin ditolak.
- [ ] Mutation katalog diuji pada data demo.
- [ ] Desktop/mobile/focus/kontras terbaca.
- [ ] Tidak ada secrets atau informasi internal sensitif pada respons/log/browser bundle.

Deployment demo akademik bukan sertifikasi kesiapan finansial/operasional restoran penuh.

## 13. Skenario Demonstrasi UAS

1. Pengelola login dan memilih outlet.
2. Pengelola menunjukkan kategori, Menu, dan meja demo.
3. QR meja dibuka dari HP pelanggan.
4. Pelanggan memilih Menu, quantity, dan catatan.
5. Pelanggan mengirim pesanan dan memperoleh nomor/konfirmasi.
6. Pengelola melihat order yang sama pada dashboard.
7. Pengelola memperbarui status; pelanggan melihat hasilnya.
8. Tunjukkan validasi atau penolakan request invalid pada data uji bila diperlukan.
9. Jelaskan bahwa pembayaran dilakukan di kasir dan belum diproses payment gateway oleh aplikasi.
10. Tunjukkan batas scope serta roadmap lanjutan.

Dataset demonstrasi terpisah dari transaksi usaha nyata. Jangan mengklaim status pembayaran lunas atau stok berkurang otomatis jika fitur tersebut tidak tersedia.

## 14. Definition of Done Rilis Awal

Rilis QR-order selesai jika:

- scope wajib pada bagian 2 berjalan di deployment tujuan;
- pelanggan benar-benar dapat scan QR dan membuat order database;
- pengelola menerima order dan mengubah status melalui jalur tervalidasi;
- harga, availability, token, permission, dan tenant/outlet scope diperiksa server;
- transaksi order atomik dan idempotency terbukti;
- pelanggan hanya bisa membaca status order yang diizinkan;
- validation/loading/empty/error/success/disabled states tersedia sesuai konteks;
- audit pada mutation sensitif yang relevan tersedia;
- verification otomatis dan integration/browser tests yang relevan lulus;
- smoke test deployment pada HP dan dashboard selesai;
- tidak ada masalah kritis atau secrets terekspos;
- panduan setup/demo/deployment/recovery dasar dapat digunakan.

**Dashboard kategori saja, demo localStorage, atau API management saja belum memenuhi Definition of Done ini.** Payment gateway, inventory, akuntansi, reservasi, dan offline tidak menjadi blocker rilis awal.

## 15. Urutan Pengembangan

1. Finalisasi UI management Menu minimum dengan core/exhaustive tests.
2. Pengelolaan meja dan mekanisme token/QR.
3. Kontrak/API menu publik dan halaman menu pelanggan.
4. Keranjang, public order endpoint, trusted token context, dan idempotency.
5. Konfirmasi/tracking pelanggan dan staff order list/status UI.
6. Integration/E2E alur QR-order dan hardening publik yang relevan.
7. Deployment, smoke test, dokumentasi, dan demonstrasi.

Rencana file/phase ditinjau sebelum BUILD. Beberapa domain existing dapat digunakan kembali, tetapi dependency dan access policy harus diperiksa dahulu. Jadwal diestimasi setelah scope ini dicocokkan dengan kode; estimasi rilis katalog tidak otomatis berlaku untuk rilis QR-order.

## 16. Roadmap Setelah Rilis Awal

- Archive/restore Menu jika belum termasuk rilis minimum, katalog lebih lengkap, varian/modifier/alergi, upload gambar.
- KDS multi-stasiun/realtime dan kitchen printer.
- POS/billing, pajak/service/diskon, shift, payment gateway, refund, reconciliation.
- Reservasi/deposit.
- Inventory/resep/procurement/HPP.
- Akuntansi dan laporan.
- PWA offline.
- Admin/approval, observability, security/recovery, serta pengujian produksi yang lebih luas.

Roadmap adalah arah pengembangan berkelanjutan, bukan klaim fitur sudah tersedia atau janji tenggat. Rilis awal mempertahankan pengalaman utama Warungku: **pesan melalui QR meja dan diterima pengelola**.

## 17. Workflow dan Lisensi

- Baca README/instruksi repository dan kontrak actual sebelum mengubah kode.
- Batasi satu domain/acceptance criterion per fase.
- Tentukan exact write scope dan tests sebelum implementasi.
- Pertahankan authorization, validation, audit, dan regression coverage.
- Jangan menerima hardcoded secrets, `any`/suppression sembarangan, atau TODO pada jalur transaksi inti.
- Review diff dan lakukan conventional commit setelah fase lolos serta diizinkan.
- Database/deployment/mutation nyata menggunakan target yang jelas dan persetujuan.
- Jangan reset database atau melonggarkan permission hanya agar demo berhasil.

Lisensi: **Proprietary**, mengikuti baseline dan ketentuan pemilik proyek. README ini tidak menetapkan lisensi open-source baru.
