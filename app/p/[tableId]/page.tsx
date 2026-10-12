import React from "react";
import { getPublicCatalog } from "@/lib/services/public-menu.service";

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
      <div className="max-w-md mx-auto bg-gray-50 min-h-screen p-6 flex flex-col items-center justify-center text-center">
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-red-800">
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
      <div className="max-w-md mx-auto bg-gray-50 min-h-screen p-6 flex flex-col items-center justify-center text-center">
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-red-800">
          <h1 className="text-lg font-bold mb-2">Sesi Tidak Valid</h1>
          <p className="text-sm">Sesi meja tidak valid atau kadaluarsa. Silakan scan ulang QR Code meja.</p>
        </div>
      </div>
    );
  }

  const { table, categories, menuItems } = catalog;

  const formatRupiah = (price: number) => {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      maximumFractionDigits: 0,
    }).format(price);
  };

  return (
    <div className="max-w-md mx-auto bg-gray-50 min-h-screen pb-12 shadow-md">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-emerald-700 text-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold">Menu Warungku</h1>
          <span className="rounded-full bg-emerald-800 px-3 py-1 text-xs font-semibold">
            Meja: {table.code}
          </span>
        </div>
      </header>

      {/* Content */}
      <main className="p-4 space-y-6">
        {categories.length === 0 ? (
          <div className="text-center py-12 text-gray-500 text-sm">
            Belum ada kategori menu yang tersedia.
          </div>
        ) : (
          categories.map((category) => {
            const itemsInCategory = menuItems.filter((item) => item.categoryId === category.id);
            if (itemsInCategory.length === 0) return null;

            return (
              <section key={category.id} className="space-y-3">
                <h2 className="text-md font-bold text-gray-900 border-b pb-1">
                  {category.name}
                </h2>
                <div className="space-y-3">
                  {itemsInCategory.map((item) => (
                    <div
                      key={item.id}
                      className={`flex justify-between items-start bg-white p-3 rounded-lg border shadow-sm ${
                        item.isSoldOut ? "opacity-60 grayscale" : ""
                      }`}
                    >
                      <div className="space-y-1 flex-1 pr-3">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-gray-800 text-sm">{item.name}</h3>
                          {item.isSoldOut && (
                            <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-700">
                              Habis
                            </span>
                          )}
                        </div>
                        {item.description && (
                          <p className="text-xs text-gray-500 line-clamp-2">{item.description}</p>
                        )}
                        <p className="text-sm font-bold text-emerald-700 pt-1">
                          {formatRupiah(item.price)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            );
          })
        )}
      </main>
    </div>
  );
}
