import { requireActiveUser } from "@/lib/auth/authorization";
import { logoutAction } from "./actions";

export default async function DashboardPage() {
  const { user, tenant } = await requireActiveUser();

  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="mx-auto max-w-4xl rounded bg-white p-6 shadow">
        <div className="mb-6 flex items-center justify-between border-b pb-4">
          <h1 className="text-xl font-bold text-gray-900">Dashboard Warungku</h1>
          <form action={logoutAction}>
            <button
              type="submit"
              className="rounded bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
            >
              Keluar
            </button>
          </form>
        </div>
        <div className="space-y-2">
          <p className="text-gray-700">
            <strong>Nama Tenant:</strong> {tenant.name} ({tenant.code})
          </p>
          <p className="text-gray-700">
            <strong>Pengguna:</strong> {user.name} ({user.email})
          </p>
          <p className="text-gray-700">
            <strong>Active Outlet ID:</strong> {userSessionOutletInfo()}
          </p>
          <div className="mt-4 rounded border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800">
            Catatan Phase 2A: Pemilihan outlet lengkap akan diselesaikan pada tahap integrasi
            database (Phase 2C).
          </div>
        </div>
      </div>
    </main>
  );
}

function userSessionOutletInfo() {
  return "Belum dipilih / Ditunda ke Phase 2C";
}
