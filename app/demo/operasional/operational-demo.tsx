"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import {
  createInitialDemoOrderState,
  loadDemoOrderState,
  resetDemoOrderState,
  updateDemoOrderStatus,
} from "@/lib/demo-order-store";
import type { DemoOrder, DemoOrderState, DemoOrderStatus } from "@/lib/demo-order-store";

type Peran = "Kasir" | "Dapur";

type FilterStatus = "Semua" | DemoOrderStatus;

type AksiPesanan = { jenis: "tombol"; label: string } | { jenis: "teks"; teks: string };

const PERAN: readonly Peran[] = ["Kasir", "Dapur"];

const FILTER_STATUS: readonly FilterStatus[] = [
  "Semua",
  "Diterima",
  "Disiapkan",
  "Siap Diantar",
  "Selesai",
];

const LANGKAH_STATUS: Record<DemoOrderStatus, DemoOrderStatus | null> = {
  Diterima: "Disiapkan",
  Disiapkan: "Siap Diantar",
  "Siap Diantar": "Selesai",
  Selesai: null,
};

const KELAS_STATUS: Record<DemoOrderStatus, string> = {
  Diterima: "border-amber-300 bg-amber-100 text-amber-900",
  Disiapkan: "border-emerald-300 bg-emerald-100 text-emerald-900",
  "Siap Diantar": "border-emerald-900/30 bg-[#F6F1E4] text-emerald-950",
  Selesai: "border-emerald-800 bg-emerald-800 text-white",
};

const fokus = "focus-visible:ring-2 focus-visible:ring-amber-600";

const tombolSekunder = [
  "inline-flex min-h-11 items-center justify-center rounded-xl border border-emerald-900/25 bg-white px-4",
  "text-sm font-semibold text-emerald-950 transition-colors hover:bg-emerald-50 hover:text-emerald-950",
  fokus,
].join(" ");

const tombolAksi = [
  "inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-emerald-700 px-4",
  "text-sm font-semibold text-white transition-colors hover:bg-emerald-800",
  fokus,
].join(" ");

const teksAksi = [
  "inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-dashed border-emerald-900/30",
  "bg-[#FDFAF4] px-4 text-center text-sm font-semibold text-emerald-900",
].join(" ");

const badgeStatus =
  "inline-flex shrink-0 items-center rounded-lg border px-2.5 py-1 text-xs font-bold";

function warnaPilihan(aktif: boolean): string {
  return aktif
    ? "border-emerald-700 bg-emerald-700 text-white"
    : "border-emerald-900/20 bg-white text-emerald-900 hover:bg-emerald-50";
}

function kelasPeran(aktif: boolean): string {
  return [
    "inline-flex min-h-11 flex-1 items-center justify-center rounded-xl border px-4",
    "text-sm font-semibold transition-colors sm:flex-none sm:px-6",
    fokus,
    warnaPilihan(aktif),
  ].join(" ");
}

function kelasFilter(aktif: boolean): string {
  return [
    "inline-flex min-h-11 items-center justify-center rounded-xl border px-3.5",
    "text-sm font-semibold transition-colors",
    fokus,
    warnaPilihan(aktif),
  ].join(" ");
}

function formatRupiah(nilai: number): string {
  return `Rp${nilai.toLocaleString("id-ID")}`;
}

function aksiPesanan(order: DemoOrder, peran: Peran): AksiPesanan {
  if (peran === "Kasir") {
    if (order.status === "Siap Diantar") return { jenis: "tombol", label: "Tandai Selesai" };
    if (order.status === "Selesai") return { jenis: "teks", teks: "Pesanan sudah selesai." };
    return { jenis: "teks", teks: "Menunggu dapur menyelesaikan masakan." };
  }
  if (order.status === "Diterima") return { jenis: "tombol", label: "Mulai Siapkan" };
  if (order.status === "Disiapkan") return { jenis: "tombol", label: "Tandai Siap" };
  return { jenis: "teks", teks: "Menunggu diantar ke meja." };
}

function judulAntreanKosong(peran: Peran, filter: FilterStatus): string {
  if (peran === "Dapur") return "Antrean dapur kosong";
  if (filter === "Semua") return "Belum ada pesanan";
  return `Belum ada pesanan berstatus ${filter}`;
}

function teksAntreanKosong(peran: Peran): string {
  if (peran === "Dapur") {
    return "Semua pesanan sudah selesai, jadi tidak ada antrian masak saat ini.";
  }
  return "Ganti filter status untuk melihat pesanan lain yang sudah tercatat.";
}

type KartuPesananProps = {
  order: DemoOrder;
  peran: Peran;
  tampilkanTotal: boolean;
  onLanjut: (id: string) => void;
};

function KartuPesanan({ order, peran, tampilkanTotal, onLanjut }: KartuPesananProps) {
  const aksi = aksiPesanan(order, peran);

  return (
    <article className="flex flex-1 flex-col rounded-2xl border border-emerald-900/10 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold text-emerald-700">{order.id}</p>
          <h3 className="mt-1 text-xl font-bold text-emerald-950">Meja {order.tableNumber}</h3>
          {order.customerName !== null && (
            <p className="mt-1 text-sm text-emerald-900">Pelanggan: {order.customerName}</p>
          )}
        </div>
        <span className={`${badgeStatus} ${KELAS_STATUS[order.status]}`}>
          <span className="sr-only">Status: </span>
          {order.status}
        </span>
      </div>

      <ul className="mt-4 space-y-2 border-t border-emerald-900/10 pt-4">
        {order.items.map((item) => (
          <li key={item.name} className="flex items-start justify-between gap-3 text-sm">
            <span className="leading-relaxed text-emerald-950">{item.name}</span>
            <span className="shrink-0 font-bold text-emerald-900 tabular-nums">
              x{item.quantity}
            </span>
          </li>
        ))}
      </ul>

      {order.note !== null && (
        <div className="mt-4 rounded-xl bg-[#F6F1E4] p-3">
          <p className="text-xs font-bold text-emerald-950">Catatan</p>
          <p className="mt-1 text-sm leading-relaxed text-emerald-900">{order.note}</p>
        </div>
      )}

      {tampilkanTotal && (
        <div className="mt-4 flex items-center justify-between gap-3 border-t border-emerald-900/10 pt-4">
          <span className="text-sm font-semibold text-emerald-900">Total</span>
          <span className="text-lg font-bold text-emerald-950 tabular-nums">
            {formatRupiah(order.total)}
          </span>
        </div>
      )}

      <div className="mt-auto pt-4">
        {aksi.jenis === "tombol" ? (
          <button type="button" onClick={() => onLanjut(order.id)} className={tombolAksi}>
            {aksi.label}
          </button>
        ) : (
          <p className={teksAksi}>{aksi.teks}</p>
        )}
      </div>
    </article>
  );
}

export function OperationalDemo() {
  const [state, setState] = useState<DemoOrderState>(() => createInitialDemoOrderState());
  const [peran, setPeran] = useState<Peran>("Kasir");
  const [filter, setFilter] = useState<FilterStatus>("Semua");
  const [pesan, setPesan] = useState("");
  const [gagalSimpan, setGagalSimpan] = useState(false);

  const orders = state.orders;

  useEffect(() => {
    try {
      setState(loadDemoOrderState());
      setGagalSimpan(false);
    } catch {
      setState(createInitialDemoOrderState());
      setGagalSimpan(true);
    }
  }, []);

  const pesananAktif = orders.filter((order) => order.status !== "Selesai").length;
  const sedangDisiapkan = orders.filter((order) => order.status === "Disiapkan").length;
  const siapDiantar = orders.filter((order) => order.status === "Siap Diantar").length;

  const ringkasan = [
    { label: "Pesanan aktif", nilai: pesananAktif },
    { label: "Sedang disiapkan", nilai: sedangDisiapkan },
    { label: "Siap diantar", nilai: siapDiantar },
  ];

  let pesananTampil = orders;
  if (peran === "Dapur") {
    pesananTampil = orders.filter((order) => order.status !== "Selesai");
  } else if (filter !== "Semua") {
    pesananTampil = orders.filter((order) => order.status === filter);
  }

  function tanganiLanjut(orderId: string) {
    const order = orders.find((item) => item.id === orderId);
    if (!order) return;
    const berikut = LANGKAH_STATUS[order.status];
    if (berikut === null) return;
    try {
      setState(updateDemoOrderStatus(orderId, berikut));
      setGagalSimpan(false);
      setPesan(`${order.id} berubah menjadi ${berikut}.`);
    } catch {
      setGagalSimpan(true);
    }
  }

  function resetDataDemo() {
    try {
      setState(resetDemoOrderState());
      setFilter("Semua");
      setGagalSimpan(false);
      setPesan("Data demo dikembalikan ke kondisi awal.");
    } catch {
      setGagalSimpan(true);
    }
  }

  const judulAntrean = peran === "Kasir" ? "Daftar Pesanan" : "Antrean Dapur";
  const jumlahAntrean =
    peran === "Kasir"
      ? `Menampilkan ${pesananTampil.length} dari ${orders.length} pesanan`
      : `Menampilkan ${pesananTampil.length} pesanan aktif`;

  return (
    <div>
      <a
        href="#konten-demo"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:rounded-xl focus:bg-emerald-800 focus:px-4 focus:py-3 focus:text-sm focus:font-semibold focus:text-white"
      >
        Lewati ke daftar pesanan
      </a>

      <header className="border-b border-emerald-900/10 bg-[#FDFAF4]">
        <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-7">
          <div className="flex flex-wrap items-center gap-3">
            <Link href="/" className={tombolSekunder}>
              Kembali ke Beranda
            </Link>
            <span className="rounded-lg bg-amber-400 px-2.5 py-1 text-xs font-bold text-emerald-950">
              Demo UI
            </span>
          </div>

          <p className="mt-5 text-sm font-bold text-emerald-700">Demo Operasional</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-emerald-950 sm:text-4xl">
            Operasional Warungku
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-emerald-900/80 sm:text-base">
            Semua pesanan di halaman ini adalah data contoh untuk melihat alur kasir dan dapur.
          </p>

          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="max-w-2xl text-xs leading-relaxed text-emerald-900/80 sm:text-sm">
              Data operasional demo disimpan hanya di localStorage browser ini.
            </p>
            <button type="button" onClick={resetDataDemo} className={tombolSekunder}>
              Reset Data Demo
            </button>
          </div>
        </div>
      </header>

      <main id="konten-demo" className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        {gagalSimpan && (
          <p
            role="alert"
            className="mb-6 rounded-xl border border-amber-300 bg-amber-100 px-4 py-3 text-sm font-semibold text-amber-900"
          >
            Penyimpanan browser tidak dapat diakses, jadi perubahan tidak dapat disimpan. Data
            contoh tetap ditampilkan.
          </p>
        )}

        <section aria-labelledby="judul-ringkasan">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="judul-ringkasan" className="text-lg font-bold text-emerald-950 sm:text-xl">
              Ringkasan Antrean
            </h2>
            <p className="text-xs text-emerald-900/80">
              Dihitung langsung dari pesanan di halaman ini
            </p>
          </div>

          <div
            aria-live="polite"
            className="mt-3 grid gap-px overflow-hidden rounded-2xl border border-emerald-900/10 bg-emerald-900/10 sm:grid-cols-3"
          >
            {ringkasan.map((item) => (
              <div key={item.label} className="bg-white p-4 sm:p-5">
                <p className="text-3xl font-bold text-emerald-950 tabular-nums">{item.nilai}</p>
                <p className="mt-1 text-sm font-semibold text-emerald-900">{item.label}</p>
              </div>
            ))}
          </div>
        </section>

        <section aria-labelledby="judul-peran" className="mt-7">
          <h2 id="judul-peran" className="text-lg font-bold text-emerald-950 sm:text-xl">
            Pilih Peran
          </h2>
          <div
            role="group"
            aria-label="Pilih peran tampilan"
            className="mt-3 flex gap-2 sm:max-w-md"
          >
            {PERAN.map((nama) => (
              <button
                key={nama}
                type="button"
                aria-pressed={peran === nama}
                onClick={() => setPeran(nama)}
                className={kelasPeran(peran === nama)}
              >
                {nama}
              </button>
            ))}
          </div>
          <p className="mt-2 text-sm leading-relaxed text-emerald-900/80">
            {peran === "Kasir"
              ? "Mode kasir menampilkan semua pesanan, filter status, dan aksi penyelesaian."
              : "Mode dapur menampilkan antrian masak tanpa pesanan yang selesai."}
          </p>
        </section>

        {peran === "Kasir" && (
          <div
            role="group"
            aria-label="Filter status pesanan"
            className="mt-5 flex flex-wrap gap-2"
          >
            {FILTER_STATUS.map((status) => (
              <button
                key={status}
                type="button"
                aria-pressed={filter === status}
                onClick={() => setFilter(status)}
                className={kelasFilter(filter === status)}
              >
                {status}
              </button>
            ))}
          </div>
        )}

        <p
          aria-live="polite"
          className="mt-5 rounded-xl border border-emerald-900/10 bg-white px-4 py-3 text-sm text-emerald-900"
        >
          {pesan !== ""
            ? `Perubahan terakhir: ${pesan}`
            : "Belum ada perubahan. Pilih tombol aksi pada kartu untuk mencoba alurnya."}
        </p>

        <section aria-labelledby="judul-antrean" className="mt-7">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="judul-antrean" className="text-lg font-bold text-emerald-950 sm:text-xl">
              {judulAntrean}
            </h2>
            <p className="text-sm text-emerald-900/80">{jumlahAntrean}</p>
          </div>

          {pesananTampil.length === 0 ? (
            <div className="mt-4 rounded-2xl border border-dashed border-emerald-900/30 bg-white p-8 text-center">
              <p className="text-sm font-bold text-emerald-950">
                {judulAntreanKosong(peran, filter)}
              </p>
              <p className="mx-auto mt-1 max-w-md text-sm leading-relaxed text-emerald-900/80">
                {teksAntreanKosong(peran)}
              </p>
            </div>
          ) : (
            <ul className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {pesananTampil.map((order) => (
                <li key={order.id} className="flex flex-col">
                  <KartuPesanan
                    order={order}
                    peran={peran}
                    tampilkanTotal={peran === "Kasir"}
                    onLanjut={tanganiLanjut}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
