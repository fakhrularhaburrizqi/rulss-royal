"use client";

import Image from "next/image";
import { useMemo, useState } from "react";

type Kategori = "Makanan" | "Minuman" | "Camilan";

const FILTER_MENU = ["Semua", "Makanan", "Minuman", "Camilan"] as const;

type FilterMenu = (typeof FILTER_MENU)[number];

type MenuItem = {
  id: string;
  nama: string;
  keterangan: string;
  harga: number;
  kategori: Kategori;
  image: string;
  imageAlt: string;
};

const MENU_WARUNGKU: MenuItem[] = [
  {
    id: "nasi-goreng",
    nama: "Nasi Goreng Spesial",
    keterangan: "Nasi goreng telur, ayam suwir, dan acar.",
    harga: 18000,
    kategori: "Makanan",
    image: "/images/menu/nasi-goreng.jpg",
    imageAlt: "Nasi goreng spesial dengan telur mata sapi dan kerupuk",
  },
  {
    id: "mie-ayam",
    nama: "Mie Ayam Warungku",
    keterangan: "Mie ayam kuah gurih dengan bawang goreng.",
    harga: 15000,
    kategori: "Makanan",
    image: "/images/menu/mie-ayam.jpg",
    imageAlt: "Semangkuk mie ayam dengan sayuran dan pangsit",
  },
  {
    id: "ayam-geprek",
    nama: "Ayam Geprek Sambal",
    keterangan: "Ayam krispi digeprek dengan sambal segar.",
    harga: 20000,
    kategori: "Makanan",
    image: "/images/menu/ayam-geprek.jpg",
    imageAlt: "Ayam geprek sambal dengan nasi, tahu, dan lalapan",
  },
  {
    id: "es-teh-manis",
    nama: "Es Teh Manis",
    keterangan: "Teh melati dingin, manisnya pas.",
    harga: 5000,
    kategori: "Minuman",
    image: "/images/menu/es-teh-manis.jpg",
    imageAlt: "Segelas es teh manis dingin",
  },
  {
    id: "kopi-susu-gula-aren",
    nama: "Kopi Susu Gula Aren",
    keterangan: "Espresso, susu segar, dan gula aren cair.",
    harga: 12000,
    kategori: "Minuman",
    image: "/images/menu/kopi-susu-gula-aren.jpg",
    imageAlt: "Es kopi susu gula aren dalam gelas",
  },
  {
    id: "pisang-goreng",
    nama: "Pisang Goreng Crispy",
    keterangan: "Pisang hangat dengan lapisan renyah.",
    harga: 10000,
    kategori: "Camilan",
    image: "/images/menu/pisang-goreng.jpg",
    imageAlt: "Pisang goreng dengan keju dan meses cokelat",
  },
];

const fokus = "focus-visible:ring-2 focus-visible:ring-amber-500";

const tombolTambah = [
  "inline-flex min-h-11 items-center justify-center rounded-xl bg-emerald-700 px-4",
  "text-sm font-semibold text-white transition-colors hover:bg-emerald-800",
  fokus,
].join(" ");

const tombolJumlah = [
  "inline-flex size-11 shrink-0 items-center justify-center rounded-lg border border-emerald-900/20",
  "bg-white text-lg leading-none font-semibold text-emerald-950 transition-colors hover:bg-emerald-50",
  fokus,
].join(" ");

const tombolHapus = [
  "inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold text-emerald-800",
  "transition-colors hover:bg-emerald-50 hover:text-emerald-950",
  fokus,
].join(" ");

function formatRupiah(nilai: number): string {
  return `Rp${nilai.toLocaleString("id-ID")}`;
}

export function MenuOrderDemo() {
  const [filter, setFilter] = useState<FilterMenu>("Semua");
  const [keranjang, setKeranjang] = useState<Record<string, number>>({});

  const menuTampil = useMemo(
    () =>
      filter === "Semua" ? MENU_WARUNGKU : MENU_WARUNGKU.filter((item) => item.kategori === filter),
    [filter]
  );

  const barisKeranjang = useMemo(
    () =>
      MENU_WARUNGKU.filter((item) => (keranjang[item.id] ?? 0) > 0).map((item) => {
        const quantity = keranjang[item.id] ?? 0;
        return { item, quantity, subtotal: item.harga * quantity };
      }),
    [keranjang]
  );

  const totalQuantity = barisKeranjang.reduce((jumlah, baris) => jumlah + baris.quantity, 0);
  const totalHarga = barisKeranjang.reduce((jumlah, baris) => jumlah + baris.subtotal, 0);

  function tambah(id: string) {
    setKeranjang((sebelumnya) => ({ ...sebelumnya, [id]: (sebelumnya[id] ?? 0) + 1 }));
  }

  function kurangi(id: string) {
    setKeranjang((sebelumnya) => {
      const quantity = sebelumnya[id] ?? 0;
      if (quantity <= 1) {
        const berikutnya = { ...sebelumnya };
        delete berikutnya[id];
        return berikutnya;
      }
      return { ...sebelumnya, [id]: quantity - 1 };
    });
  }

  function hapus(id: string) {
    setKeranjang((sebelumnya) => {
      const berikutnya = { ...sebelumnya };
      delete berikutnya[id];
      return berikutnya;
    });
  }

  return (
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
            Keranjang ini hanya contoh tampilan, belum terkirim ke dapur.
          </p>
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start lg:gap-8">
          <div>
            <div
              role="group"
              aria-label="Filter kategori menu"
              className="flex flex-wrap items-center gap-2"
            >
              {FILTER_MENU.map((kategori) => {
                const aktif = filter === kategori;
                return (
                  <button
                    key={kategori}
                    type="button"
                    aria-pressed={aktif}
                    onClick={() => setFilter(kategori)}
                    className={[
                      "inline-flex min-h-11 items-center rounded-xl border px-4 text-sm font-semibold transition-colors",
                      fokus,
                      aktif
                        ? "border-emerald-700 bg-emerald-700 text-white"
                        : "border-emerald-900/20 bg-white text-emerald-900 hover:bg-emerald-50",
                    ].join(" ")}
                  >
                    {kategori}
                  </button>
                );
              })}
            </div>

            <p className="mt-3 text-sm text-emerald-900/80">
              Menampilkan {menuTampil.length} dari {MENU_WARUNGKU.length} menu
            </p>

            <ul className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {menuTampil.map((item) => {
                const jumlahItem = keranjang[item.id] ?? 0;
                return (
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
                        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, (max-width: 1280px) 40vw, 320px"
                      />
                    </div>
                    <div className="flex flex-1 flex-col p-5">
                      <p className="text-xs font-semibold text-emerald-700">{item.kategori}</p>
                      <h3 className="mt-1 text-base font-semibold text-emerald-950">{item.nama}</h3>
                      <p className="mt-1 text-sm leading-relaxed text-emerald-900/80">
                        {item.keterangan}
                      </p>

                      <div className="mt-auto pt-5">
                        {jumlahItem > 0 && (
                          <p className="mb-4 inline-flex rounded-lg bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-800">
                            {jumlahItem} di keranjang
                          </p>
                        )}
                        <div className="flex items-center justify-between gap-3 border-t border-emerald-900/10 pt-4">
                          <span className="text-lg font-bold text-emerald-950">
                            {formatRupiah(item.harga)}
                          </span>
                          <button
                            type="button"
                            aria-label={`Tambah ${item.nama} ke keranjang`}
                            onClick={() => tambah(item.id)}
                            className={tombolTambah}
                          >
                            Tambah
                          </button>
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>

          <aside
            aria-labelledby="judul-keranjang"
            className="lg:sticky lg:top-24 lg:max-h-[calc(100vh_-_7rem)] lg:overflow-y-auto"
          >
            <div className="rounded-2xl border border-emerald-900/10 bg-white shadow-sm">
              <div className="border-b border-emerald-900/10 px-5 py-4">
                <h2 id="judul-keranjang" className="text-base font-bold text-emerald-950">
                  Keranjang Belanja
                </h2>
              </div>

              <div className="px-5 py-4">
                {barisKeranjang.length === 0 ? (
                  <div>
                    <p className="text-sm font-semibold text-emerald-950">Keranjang masih kosong</p>
                    <p className="mt-1 text-sm leading-relaxed text-emerald-900/80">
                      Pilih menu favoritmu untuk mulai memesan.
                    </p>
                  </div>
                ) : (
                  <ul className="divide-y divide-emerald-900/10">
                    {barisKeranjang.map(({ item, quantity, subtotal }) => (
                      <li key={item.id} className="py-4 first:pt-0 last:pb-0">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-emerald-950">{item.nama}</p>
                            <p className="mt-0.5 text-xs text-emerald-900/80">
                              {formatRupiah(item.harga)} per porsi
                            </p>
                          </div>
                          <p className="text-sm font-semibold text-emerald-950">
                            {formatRupiah(subtotal)}
                          </p>
                        </div>

                        <div className="mt-3 flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              aria-label={`Kurangi jumlah ${item.nama}`}
                              onClick={() => kurangi(item.id)}
                              className={tombolJumlah}
                            >
                              &minus;
                            </button>
                            <span className="min-w-8 text-center text-sm font-semibold text-emerald-950">
                              {quantity}
                            </span>
                            <button
                              type="button"
                              aria-label={`Tambah jumlah ${item.nama}`}
                              onClick={() => tambah(item.id)}
                              className={tombolJumlah}
                            >
                              +
                            </button>
                          </div>
                          <button
                            type="button"
                            aria-label={`Hapus ${item.nama} dari keranjang`}
                            onClick={() => hapus(item.id)}
                            className={tombolHapus}
                          >
                            Hapus
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}

                <div
                  aria-live="polite"
                  className="mt-4 space-y-1.5 border-t border-emerald-900/10 pt-4"
                >
                  <div className="flex items-center justify-between gap-3 text-sm text-emerald-900">
                    <span>Jumlah item</span>
                    <span className="font-semibold text-emerald-950">{totalQuantity}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-semibold text-emerald-900">Total</span>
                    <span className="text-lg font-bold text-emerald-950">
                      {formatRupiah(totalHarga)}
                    </span>
                  </div>
                </div>

                {/* TODO: checkout dibuat pada tahap berikutnya, sengaja tanpa aksi di demo ini */}
                <button
                  type="button"
                  disabled={totalQuantity === 0}
                  className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-emerald-700 px-5 text-sm font-semibold text-white transition-colors focus-visible:ring-2 focus-visible:ring-amber-500 enabled:hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-emerald-900/10 disabled:text-emerald-950/70"
                >
                  Tinjau Pesanan
                </button>
                <p className="mt-2 text-center text-xs leading-relaxed text-emerald-900/80">
                  Checkout akan tersedia pada tahap berikutnya.
                </p>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}
