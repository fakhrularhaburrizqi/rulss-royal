import { z } from "zod";

const tenantCodeRegex = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;

export const tenantCodeSchema = z
  .string()
  .min(2, "Kode tenant minimal 2 karakter")
  .max(50, "Kode tenant maksimal 50 karakter")
  .refine(
    (val) => {
      const normalized = val.trim().toLowerCase();
      return tenantCodeRegex.test(normalized);
    },
    { message: "Format kode tenant tidak valid" }
  )
  .transform((val) => val.trim().toLowerCase());

export const loginCredentialsSchema = z.object({
  tenantCode: tenantCodeSchema,
  email: z
    .string()
    .transform((val) => val.trim().toLowerCase())
    .pipe(z.string().email("Format email tidak valid")),
  password: z.string().min(1, "Kata sandi wajib diisi"),
});

export type LoginCredentialsInput = z.infer<typeof loginCredentialsSchema>;
