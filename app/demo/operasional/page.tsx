import type { Metadata } from "next";

import { OperationalDemo } from "./operational-demo";

export const metadata: Metadata = {
  title: "Demo Operasional Kasir dan Dapur | Rulss Royal",
  description:
    "Demo UI alur pesanan dari kasir ke dapur. Semua pesanan adalah data contoh dan tidak tersimpan.",
};

export default function DemoOperasionalPage() {
  return (
    <div className="min-h-screen bg-[#FDFAF4] font-sans text-emerald-950">
      <OperationalDemo />
    </div>
  );
}
