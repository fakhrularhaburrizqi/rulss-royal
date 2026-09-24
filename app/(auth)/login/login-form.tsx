"use client";

import { useActionState } from "react";
import { loginAction } from "./actions";

export function LoginForm() {
  const [state, formAction, isPending] = useActionState(loginAction, null);

  return (
    <form action={formAction} className="w-full max-w-sm space-y-4">
      {state?.error && (
        <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-600">
          {state.error}
        </div>
      )}
      <div>
        <label className="block text-sm font-medium text-gray-700" htmlFor="tenantCode">
          Kode Tenant
        </label>
        <input
          id="tenantCode"
          name="tenantCode"
          type="text"
          required
          autoComplete="organization"
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 focus:outline-none sm:text-sm"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 focus:outline-none sm:text-sm"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700" htmlFor="password">
          Kata Sandi
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 focus:outline-none sm:text-sm"
        />
      </div>
      <button
        type="submit"
        disabled={isPending}
        className="flex w-full justify-center rounded-md border border-transparent bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:outline-none disabled:opacity-50"
      >
        {isPending ? "Memproses..." : "Masuk"}
      </button>
    </form>
  );
}
