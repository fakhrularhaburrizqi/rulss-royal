"use server";

import { AuthError } from "next-auth";
import { signIn } from "@/auth";
import { getGenericAuthErrorMessage, getServerAuthErrorMessage } from "@/lib/auth/errors";
import { loginCredentialsSchema } from "@/lib/validators/auth.validator";

type LoginState = {
  error: string;
} | null;

export async function loginAction(
  _previousState: LoginState,
  formData: FormData
): Promise<LoginState> {
  const parsed = loginCredentialsSchema.safeParse({
    tenantCode: formData.get("tenantCode"),
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: getGenericAuthErrorMessage() };
  }

  try {
    await signIn("credentials", {
      tenantCode: parsed.data.tenantCode,
      email: parsed.data.email,
      password: parsed.data.password,
      redirectTo: "/dashboard",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: getGenericAuthErrorMessage() };
    }

    /*
     * Auth.js/Next.js menggunakan thrown redirect ketika login berhasil.
     * Error selain AuthError harus dilempar kembali agar redirect tetap bekerja.
     */
    throw error;
  }

  return { error: getServerAuthErrorMessage() };
}
