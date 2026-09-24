import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gray-50 p-6">
      <div className="w-full max-w-md rounded-lg bg-white p-8 shadow">
        <h1 className="mb-6 text-center text-2xl font-bold text-gray-900">Masuk ke Warungku</h1>
        <LoginForm />
      </div>
    </main>
  );
}
