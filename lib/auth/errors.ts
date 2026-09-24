export const AUTH_ERROR_MESSAGES = {
  INVALID_CREDENTIALS: "Kode tenant, email, atau kata sandi tidak valid.",
  SERVER_ERROR: "Terjadi kesalahan. Silakan coba lagi.",
} as const;

export function getGenericAuthErrorMessage(): string {
  return AUTH_ERROR_MESSAGES.INVALID_CREDENTIALS;
}

export function getServerAuthErrorMessage(): string {
  return AUTH_ERROR_MESSAGES.SERVER_ERROR;
}
