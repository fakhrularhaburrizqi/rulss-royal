import { z } from "zod";

export const createUserSchema = z.object({
  tenantId: z.string().cuid(),
  name: z.string().min(1, "Name is required"),
  email: z
    .string()
    .transform((val) => val.trim().toLowerCase())
    .pipe(z.string().email("Invalid email format")),
  passwordHash: z.string().min(6).optional().nullable(),
  pinHash: z.string().optional().nullable(),
  isActive: z.boolean().default(true),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
