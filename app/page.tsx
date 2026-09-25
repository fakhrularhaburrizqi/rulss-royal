import Image from "next/image";
import Link from "next/link";

type MenuItem = {
  id: string;
  nama: string;
  keterangan: string;
  harga: number;
  image: string;
  imageAlt: string;
};

const MENU_WARUNGKU: MenuItem[] = [
  {
    id: "nasi-goreng-spesial",
    nama: "Nasi Goreng Spesial",
    keterangan: "Nasi goreng telur, ayam suwir, dan acar.",
    harga: 18000,
    image: "/images/menu/nasi-goreng.jpg",
    imageAlt: "Nasi goreng spesial dengan telur mata sapi dan kerupuk",
  },
  {
    id: "mie-ayam-warungku",
    nama: "Mie Ayam Warungku",
    keterangan: "Mie ayam kuah gurih dengan bawang goreng.",
    harga: 15000,
    image: "/images/menu/mie-ayam.jpg",
    imageAlt: "Semangkuk mie ayam dengan sayuran dan pangsit",
  },
  {
    id: "ayam-geprek-sambal",
    nama: "Ayam Geprek Sambal",
    keterangan: "Ayam krispi digeprek dengan sambal segar.",
    harga: 20000,
    image: "/images/menu/ayam-geprek.jpg",
    imageAlt: "Ayam geprek sambal dengan nasi, tahu, dan lalapan",
  },
  {
    id: "es-teh-manis",
    nama: "Es Teh Manis",
    keterangan: "Teh melati dingin, manisnya pas.",
    harga: 5000,
    image: "/images/menu/es-teh-manis.jpg",
    imageAlt: "Segelas es teh manis dingin",
  },
  {
    id: "kopi-susu-gula-aren",
    nama: "Kopi Susu Gula Aren",
    keterangan: "Espresso, susu segar, dan gula aren cair.",
    harga: 12000,
    image: "/images/menu/kopi-susu-gula-aren.jpg",
    imageAlt: "Es kopi susu gula aren dalam gelas",
  },
  {
    id: "pisang-goreng-crispy",
    nama: "Pisang Goreng Crispy",
    keterangan: "Pisang hangat dengan lapisan renyah.",
    harga: 10000,
    image: "/images/menu/pisang-goreng.jpg",
    imageAlt: "Pisang goreng dengan keju dan meses cokelat",
  },
];

const KEUNGGULAN_WARUNG = [
  {
    judul: "Scan QR di Meja",
    teks: "Stiker QR ada di meja. Tamu buka lewat kamera, menu langsung terbuka tanpa unduh aplikasi.",
  },
  {
    judul: "Pesanan Langsung ke Dapur",
    teks: "Begitu pesanan dikirim, order muncul di dashboard warung lengkap dengan nomor mejanya.",
  },
  {
    judul: "Pembayaran Mudah",
    teks: "Tamu bayar tunai di kasir atau transfer, tagihan dihitung dari pesanan yang masuk.",
  },
];

const LANGKAH_PESAN = [
  {
    judul: "Scan QR di Meja",
    teks: "Buka kamera HP, arahkan ke stiker QR yang ditempel di meja.",
  },
  {
    judul: "Pilih Menu",
    teks: "Lihat daftar menu dan harga, ketuk Tambah pada menu yang dipesan.",
  },
  {
    judul: "Kirim Pesanan",
    teks: "Periksa keranjang belanja, lalu kirim pesanan ke dapur.",
  },
  {
    judul: "Pesanan Diantar",
    teks: "Tinggal tunggu di meja, makanan diantar tanpa perlu antre di kasir.",
  },
];

const KEUNGGULAN_PEMILIK = [
  {
    judul: "Menu Mudah Diperbarui",
    teks: "Ganti harga atau sembunyikan menu yang habis, tamu langsung melihat versi terbarunya.",
  },
  {
    judul: "Pesanan Tercatat Rapi",
    teks: "Setiap pesanan masuk ke dashboard lengkap dengan waktu kirim dan nomor meja.",
  },
  {
    judul: "Antrean Kasir Berkurang",
    teks: "Tidak semua tamu harus mengantri di kasir hanya untuk memesan makanan.",
  },
  {
    judul: "Tanpa Perangkat Tambahan",
    teks: "Cetak satu QR, tempel di meja, selesai. Tidak perlu tablet atau alat kasir baru.",
  },
];

const fokus = "focus-visible:ring-2 focus-visible:ring-amber-500";

const tombolPrimer = [
  "inline-flex min-h-11 items-center justify-center rounded-xl bg-emerald-700 px-5 py-2.5",
  "text-sm font-semibold text-white transition-colors hover:bg-emerald-800",
  fokus,
].join(" ");

const tombolGaris = [
  "inline-flex min-h-11 items-center justify-center rounded-xl border border-emerald-900/25",
  "bg-white px-5 py-2.5 text-sm font-semibold text-emerald-950 transition-colors hover:bg-emerald-50",
  fokus,
].join(" ");

const tombolAmber = [
  "inline-flex min-h-11 items-center justify-center rounded-xl bg-amber-400 px-5 py-2.5",
  "text-sm font-semibold text-emerald-950 transition-colors hover:bg-amber-300",
  fokus,
].join(" ");

const tombolGelap = [
  "inline-flex min-h-11 items-center justify-center rounded-xl border border-white/40 px-5 py-2.5",
  "text-sm font-semibold text-white transition-colors hover:bg-white/10",
  fokus,
].join(" ");

const tautanNav = [
  "inline-flex min-h-11 items-center rounded-lg px-2 text-sm font-medium text-emerald-900",
  "transition-colors hover:text-emerald-700",
  fokus,
].join(" ");

function formatRupiah(nilai: number): string {
  return `Rp${nilai.toLocaleString("id-ID")}`;
}

export default function Home() {
  return (
    <div className="font-sans">
      <a
        href="#konten"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:rounded-xl focus:bg-emerald-800 focus:px-4 focus:py-3 focus:text-sm focus:font-semibold focus:text-white"
      >
        Lewati ke konten utama
      </a>

      <header className="border-b border-emerald-900/10 bg-[#FDFAF4] text-emerald-950 sm:sticky sm:top-0 sm:z-40">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 sm:px-6 sm:py-2.5">
          <Link
            href="/"
            className={`inline-flex min-h-11 items-center gap-2 rounded-xl px-1 ${fokus}`}
          >
            <span
              aria-hidden="true"
              className="grid size-9 place-items-center rounded-xl bg-emerald-700 text-lg font-bold text-white"
            >
              W
            </span>
            <span className="text-lg font-bold tracking-tight text-emerald-950">Warungku</span>
          </Link>

          <a href="/login" className={`ml-auto sm:hidden ${tombolPrimer}`}>
            Masuk Dashboard
          </a>

          <nav
            aria-label="Navigasi utama"
            className={`hidden w-full items-center gap-x-1 sm:ml-auto sm:flex sm:w-auto`}
          >
            <a href="#menu" className={tautanNav}>
              Menu
            </a>
            <a href="#cara-pesan" className={tautanNav}>
              Cara Pesan
            </a>
            <a href="#keunggulan" className={tautanNav}>
              Keunggulan
            </a>
            <a href="/login" className={`ml-2 ${tombolPrimer}`}>
              Masuk Dashboard
            </a>
          </nav>

          <nav aria-label="Navigasi utama" className="flex w-full items-center gap-x-1 sm:hidden">
            <a href="#menu" className={tautanNav}>
              Menu
            </a>
            <a href="#cara-pesan" className={tautanNav}>
              Cara Pesan
            </a>
            <a href="#keunggulan" className={tautanNav}>
              Keunggulan
            </a>
          </nav>
        </div>
      </header>

      <main id="konten">
        <section aria-labelledby="judul-hero" className="bg-[#FDFAF4] text-emerald-950">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-[1.05fr_.95fr] lg:items-center lg:gap-14 lg:py-24">
            <div>
              <h1
                id="judul-hero"
                className="text-4xl leading-[1.08] font-bold tracking-tight text-emerald-950 sm:text-5xl lg:text-6xl"
              >
                Pesan dari Meja, Nikmati Tanpa Antre
              </h1>
              <p className="mt-5 max-w-xl text-base leading-relaxed text-emerald-900/80 sm:text-lg">
                Warungku mencatat pesanan lewat QR di meja. Tamu pilih menu dari HP, pesanan
                langsung masuk ke dapur, dan makanan diantar ke meja.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <a href="#menu" className={tombolPrimer}>
                  Lihat Menu
                </a>
                <a href="#cara-pesan" className={tombolGaris}>
                  Cara Memesan
                </a>
              </div>
            </div>

            <figure className="mx-auto w-full max-w-sm rounded-2xl border border-emerald-900/10 bg-white p-5 shadow-lg sm:max-w-md">
              <figcaption className="text-sm font-semibold text-emerald-900/80">
                Contoh struk pesanan
              </figcaption>
              <div className="mt-3 flex items-center justify-between border-b border-dashed border-emerald-900/20 pb-3">
                <span className="font-bold text-emerald-950">Warungku</span>
                <span className="rounded-lg bg-amber-100 px-2 py-1 text-sm font-semibold text-amber-800">
                  Meja 4
                </span>
              </div>
              <ul className="mt-3 space-y-2 text-sm text-emerald-950">
                <li className="flex items-start justify-between gap-4">
                  <span>Nasi Goreng Spesial</span>
                  <span className="font-semibold">Rp18.000</span>
                </li>
                <li className="flex items-start justify-between gap-4">
                  <span>Es Teh Manis</span>
                  <span className="font-semibold">Rp5.000</span>
                </li>
              </ul>
              <div className="mt-3 flex items-center justify-between border-t border-dashed border-emerald-900/20 pt-3 text-base font-bold text-emerald-950">
                <span>Total</span>
                <span>Rp23.000</span>
              </div>
              <p className="mt-3 text-xs text-emerald-900/80">
                Pesanan contoh dari meja. Bagian dari demo UI.
              </p>
            </figure>
          </div>
        </section>

        <section
          id="keunggulan"
          aria-labelledby="judul-keunggulan"
          className="scroll-mt-24 bg-emerald-800 text-white"
        >
          <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-14">
            <h2 id="judul-keunggulan" className="text-2xl font-bold tracking-tight sm:text-3xl">
              Keunggulan Warungku
            </h2>
            <p className="mt-2 max-w-2xl text-base leading-relaxed text-white/80">
              Tiga hal yang membuat pemesanan di warung terasa lebih ringan.
            </p>
            <ul className="mt-8 grid gap-px overflow-hidden rounded-2xl bg-white/20 sm:grid-cols-3">
              {KEUNGGULAN_WARUNG.map((item) => (
                <li key={item.judul} className="bg-emerald-800 p-5 sm:p-6">
                  <h3 className="text-lg font-semibold">{item.judul}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-white/80">{item.teks}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section
          id="menu"
          aria-labelledby="judul-menu"
          className="scroll-mt-24 bg-[#FDFAF4] text-emerald-950"
        >
          <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-16 lg:py-20">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 id="judul-menu" className="text-2xl font-bold tracking-tight sm:text-3xl">
                  Menu Warungku
                </h2>
                <p className="mt-2 max-w-xl text-base leading-relaxed text-emerald-900/80">
                  Enam menu contoh untuk demo ini, harganya dalam rupiah.
                </p>
              </div>
              <p className="text-sm text-emerald-900/80 sm:max-w-[15rem] sm:text-right">
                Tombol Tambah hanya tampilan pada demo ini.
              </p>
            </div>

            <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {MENU_WARUNGKU.map((item) => (
                <li
                  key={item.id}
                  className="flex flex-col overflow-hidden rounded-2xl border border-emerald-900/10 bg-white shadow-sm"
                >
                  <div className="relative aspect-[4/3] overflow-hidden bg-emerald-50">
                    <Image
                      src={item.image}
                      alt={item.imageAlt}
                      fill
                      className="object-cover"
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                    />
                  </div>
                  <div className="flex flex-1 flex-col p-5">
                    <h3 className="text-base font-semibold text-emerald-950">{item.nama}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-emerald-900/80">
                      {item.keterangan}
                    </p>
                    <div className="mt-5 flex items-center justify-between gap-3 border-t border-emerald-900/10 pt-4">
                      <span className="text-lg font-bold text-emerald-950">
                        {formatRupiah(item.harga)}
                      </span>
                      {/* TODO demo: tombol Tambah hanya tampilan, belum terhubung ke keranjang */}
                      <span
                        aria-hidden="true"
                        className="pointer-events-none inline-flex min-h-11 items-center rounded-xl bg-emerald-700 px-4 text-sm font-semibold text-white select-none"
                      >
                        Tambah
                      </span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section
          id="cara-pesan"
          aria-labelledby="judul-cara-pesan"
          className="scroll-mt-24 bg-white text-emerald-950"
        >
          <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-16">
            <h2 id="judul-cara-pesan" className="text-2xl font-bold tracking-tight sm:text-3xl">
              Cara Memesan
            </h2>
            <p className="mt-2 max-w-2xl text-base leading-relaxed text-emerald-900/80">
              Empat langkah dari meja sampai pesanan diantar.
            </p>
            <ol className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {LANGKAH_PESAN.map((langkah, index) => (
                <li key={langkah.judul} className="border-t-2 border-emerald-700/30 pt-4">
                  <span
                    aria-hidden="true"
                    className="block text-4xl leading-none font-black text-amber-700"
                  >
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <h3 className="mt-3 text-base font-semibold text-emerald-950">{langkah.judul}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-emerald-900/80">{langkah.teks}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section aria-labelledby="judul-pemilik" className="bg-[#F6F1E4] text-emerald-950">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 sm:py-16 lg:grid-cols-[.85fr_1.15fr] lg:items-start lg:gap-14 lg:py-20">
            <div>
              <h2 id="judul-pemilik" className="text-2xl font-bold tracking-tight sm:text-3xl">
                Keuntungan untuk Pemilik Warung
              </h2>
              <p className="mt-3 text-base leading-relaxed text-emerald-900/80">
                Pesanan masuk lewat QR, bukan lewat antrean di kasir. Warung tetap fokus memasak.
              </p>
              <a href="/login" className={`mt-6 ${tombolPrimer}`}>
                Masuk Dashboard
              </a>
            </div>

            <ul className="overflow-hidden rounded-2xl border border-emerald-900/10 bg-white">
              {KEUNGGULAN_PEMILIK.map((item, index) => (
                <li
                  key={item.judul}
                  className={`flex gap-4 p-5 ${index > 0 ? "border-t border-emerald-900/10" : ""}`}
                >
                  <div>
                    <h3 className="text-base font-semibold text-emerald-950">{item.judul}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-emerald-900/80">{item.teks}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section aria-labelledby="judul-cta" className="bg-emerald-900 text-white">
          <div className="mx-auto max-w-6xl px-4 py-14 text-center sm:px-6 sm:py-16">
            <h2 id="judul-cta" className="text-2xl font-bold tracking-tight sm:text-3xl">
              Mulai dari Menu Demo
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-base leading-relaxed text-white/80">
              Buka menu contoh untuk melihat alurnya, atau masuk ke dashboard warung.
            </p>
            <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
              <a href="#menu" className={tombolAmber}>
                Lihat Menu
              </a>
              <a href="/login" className={tombolGelap}>
                Masuk Dashboard
              </a>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/10 bg-emerald-950 text-white/70">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <p className="text-lg font-bold text-white">Warungku</p>
            <p className="mt-1 text-sm">Demo UI untuk warung, kafe, dan UMKM kuliner.</p>
          </div>
          <nav
            aria-label="Navigasi footer"
            className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm"
          >
            <a href="#menu" className={`hover:text-white ${fokus}`}>
              Menu
            </a>
            <a href="#cara-pesan" className={`hover:text-white ${fokus}`}>
              Cara Pesan
            </a>
            <a href="#keunggulan" className={`hover:text-white ${fokus}`}>
              Keunggulan
            </a>
            <a href="/login" className={`hover:text-white ${fokus}`}>
              Masuk Dashboard
            </a>
          </nav>
        </div>
        <div className="border-t border-white/10">
          <p className="mx-auto max-w-6xl px-4 py-5 text-sm sm:px-6">
            © 2026 Warungku. <span className="font-semibold text-amber-300">Demo UI</span>
          </p>
        </div>
      </footer>
    </div>
  );
}
