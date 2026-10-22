import { LoginForm } from "./login-form";
import Link from "next/link";
import Image from "next/image";

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
        <div className="flex flex-col items-center mb-6">
          <Image
            src="/logo.png"
            alt="Rulss Royal Logo"
            width={80}
            height={80}
            className="rounded-full object-cover shadow-lg border-2 border-emerald-500/30 mb-4"
          />
          <h1 className="text-center text-2xl font-bold text-gray-900">Masuk ke Rulss Royal</h1>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
