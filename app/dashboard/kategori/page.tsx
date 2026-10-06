import { redirect } from "next/navigation";
import { resolveDashboardContext } from "@/lib/dashboard/context";
import { requireActiveUser } from "@/lib/auth/authorization";
import { listMenuCategoriesPaginated } from "@/lib/services/menu-category-query.service";
import { DashboardShell } from "../components/DashboardShell";
import { CategoryListPage } from "./CategoryListPage";

export default async function KategoriPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  let resolution;
  try {
    resolution = await resolveDashboardContext(searchParams);
  } catch {
    redirect("/login");
  }

  const { user, tenant } = await requireActiveUser();

  if (resolution.kind !== "selected" || !resolution.capabilities.canViewCatalog) {
    return (
      <DashboardShell
        resolution={resolution}
        tenantName={tenant.name}
        tenantCode={tenant.code}
        userName={user.name}
        currentPath="/dashboard/kategori"
      >
        <div className="rounded-lg border border-emerald-900/10 bg-white p-6 text-center">
          <h2 className="text-lg font-semibold text-emerald-950">Kategori</h2>
          <p className="mt-2 text-sm text-emerald-700">
            {resolution.kind !== "selected"
              ? "Pilih outlet terlebih dahulu untuk melihat kategori."
              : "Anda tidak memiliki izin untuk melihat katalog di outlet ini."}
          </p>
        </div>
      </DashboardShell>
    );
  }

  let initialData;
  try {
    initialData = await listMenuCategoriesPaginated({
      outlet: resolution.outlet.id,
      limit: 50,
      filter: "all",
      search: undefined,
      cursor: undefined,
    });
  } catch {
    initialData = undefined;
  }
  const initialDataUpdatedAt = Date.now();

  return (
    <DashboardShell
      resolution={resolution}
      tenantName={tenant.name}
      tenantCode={tenant.code}
      userName={user.name}
      currentPath="/dashboard/kategori"
    >
      <CategoryListPage
        authScope={{ tenantId: tenant.id, userId: user.id }}
        outletId={resolution.outlet.id}
        initialData={initialData}
        initialDataUpdatedAt={initialDataUpdatedAt}
      />
    </DashboardShell>
  );
}