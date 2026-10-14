import { LoginForm } from "./login-form";
import Link from "next/link";

export default function LoginPage() {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center bg-gray-50 p-6">
      <div className="absolute left-6 top-6 sm:left-12 sm:top-12">
        <Link
          href="/"
          className="inline-flex items-center text-sm text-gray-500 hover:text-gray-900 transition-colors"
        >
          <span className="mr-1">&larr;</span> Kembali ke Beranda
        </Link>
      </div>
      <div className="w-full max-w-md rounded-lg bg-white p-8 shadow">
        <h1 className="mb-6 text-center text-2xl font-bold text-gray-900">Masuk ke Warungku</h1>
        <LoginForm />
      </div>
    </main>
  );
}
