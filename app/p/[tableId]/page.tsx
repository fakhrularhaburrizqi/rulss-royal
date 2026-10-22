import React from "react";
import { getPublicCatalog } from "@/lib/services/public-menu.service";
import { PublicMenuClient } from "./PublicMenuClient";

interface PublicMenuPageProps {
  params: Promise<{ tableId: string }>;
  searchParams: Promise<{ token?: string }>;
}

export default async function PublicMenuPage({ params, searchParams }: PublicMenuPageProps) {
  const resolvedParams = await params;
  const resolvedSearch = await searchParams;

  const tableId = resolvedParams.tableId;
  const token = resolvedSearch.token;

  if (!token || typeof token !== "string" || token.trim() === "") {
    return (
      <div className="max-w-md mx-auto bg-white dark:bg-gray-900 min-h-screen p-6 flex flex-col items-center justify-center text-center">
        <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950 p-6 text-red-800 dark:text-red-200">
          <h1 className="text-lg font-bold mb-2">Akses Ditolak</h1>
          <p className="text-sm">Token akses tidak ditemukan. Silakan scan ulang QR Code di meja Anda.</p>
        </div>
      </div>
    );
  }

  let catalog;
  try {
    catalog = await getPublicCatalog(tableId, token);
  } catch {
    return (
      <div className="max-w-md mx-auto bg-white dark:bg-gray-900 min-h-screen p-6 flex flex-col items-center justify-center text-center">
        <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950 p-6 text-red-800 dark:text-red-200">
          <h1 className="text-lg font-bold mb-2">Sesi Tidak Valid</h1>
          <p className="text-sm">Sesi meja tidak valid atau kadaluarsa. Silakan scan ulang QR Code meja.</p>
        </div>
      </div>
    );
  }

  return <PublicMenuClient catalog={catalog} tableId={tableId} token={token} />;
}
