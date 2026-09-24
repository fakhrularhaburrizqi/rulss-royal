import "server-only";
import bcrypt from "bcryptjs";

const SALT_ROUNDS = 12;

export async function hashPassword(password: string): Promise<string> {
  if (!password || typeof password !== "string") {
    throw new Error("Invalid password input for hashing");
  }
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  if (
    !password ||
    typeof password !== "string" ||
    !passwordHash ||
    typeof passwordHash !== "string"
  ) {
    return false;
  }
  return bcrypt.compare(password, passwordHash);
}
